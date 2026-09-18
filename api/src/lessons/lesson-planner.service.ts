// Планировщик занятий против настоящей Mongo (CLAUDE.md «Тесты» — не мок
// модели): генерация на PLANNING_HORIZON_WEEKS вперёд и согласование с
// текущими правилами расписания (docs/PLAN.md §6). Решения считает
// reconcileClass (lesson-reconcile.ts), запросы — lesson-planner.queries.ts.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime, IANAZone } from 'luxon';
import { Model } from 'mongoose';
import { PLANNING_HORIZON_WEEKS } from '@xuanxue/shared';
import { errorMessage, errorStack } from '../common/error-info';
import { LessonLinkRebuildService } from '../broadcasts/lesson-link-rebuild.service';
import { ClassRecord } from '../classes/class.schema';
import type { LeanClass } from '../classes/class.mapper';
import { LessonRecord } from './lesson.schema';
import { reconcileClass, untouchedLessonIds } from './lesson-reconcile';
import {
  deleteLessons,
  deleteOrphanLessons,
  findPlannedLessons,
  insertMissing,
  moveLesson,
} from './lesson-planner.queries';

type ClassLean = Pick<LeanClass, '_id' | 'active' | 'tz' | 'leadMinutes' | 'rules'>;
const CLASS_PROJECTION = { active: 1, tz: 1, leadMinutes: 1, rules: 1 } as const;

export interface PlanResult {
  created: number;
  removed: number;
}

@Injectable()
export class LessonPlannerService {
  private readonly logger = new Logger(LessonPlannerService.name);

  constructor(
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    private readonly lessonLinkRebuild: LessonLinkRebuildService,
  ) {}

  async plan(now: DateTime): Promise<PlanResult> {
    const from = now;
    const to = now.plus({ weeks: PLANNING_HORIZON_WEEKS });
    const classes = await this.classModel.find({}, CLASS_PROJECTION).lean<ClassLean[]>();

    let created = 0;
    let removed = 0;
    for (const cls of classes) {
      try {
        const result = await this.planClass(cls, now, from, to);
        created += result.created;
        removed += result.removed;
      } catch (err) {
        this.logger.error(
          `Планирование класса ${cls._id.toString()} упало: ${errorMessage(err)}`,
          errorStack(err),
        );
      }
    }

    removed += await deleteOrphanLessons(
      this.lessonModel,
      classes.map((cls) => cls._id),
      now,
      this.logger,
    );
    return { created, removed };
  }

  // Один класс — своя ошибка не блокирует остальные: невалидный tz или сбой
  // запроса по одному классу не должны останавливать генерацию школы.
  private async planClass(
    cls: ClassLean,
    now: DateTime,
    from: DateTime,
    to: DateTime,
  ): Promise<PlanResult> {
    const leadBoundaryMs = now.plus({ minutes: cls.leadMinutes }).toMillis();
    const existing = await findPlannedLessons(this.lessonModel, cls._id, now);

    if (!cls.active) {
      const removed = await deleteLessons(
        this.lessonModel,
        untouchedLessonIds(existing, leadBoundaryMs),
      );
      return { created: 0, removed };
    }
    if (!IANAZone.isValidZone(cls.tz)) {
      this.logger.warn(
        `Класс ${cls._id.toString()}: невалидный часовой пояс "${cls.tz}", класс пропущен`,
      );
      return { created: 0, removed: 0 };
    }

    const plan = reconcileClass(existing, cls.rules, cls.tz, leadBoundaryMs, from, to);
    const removed = await deleteLessons(this.lessonModel, plan.toDelete);
    for (const move of plan.toMove) {
      const moved = await moveLesson(this.lessonModel, move);
      if (!moved) {
        this.logger.warn(
          `Класс ${cls._id.toString()}: перенос занятия ${move.id.toString()} ` +
            'столкнулся с уже занятым местом, перенос отложен до следующего тика',
        );
        continue;
      }
      // Узкое, но настоящее окно (ADR-0054): планировщик не трогает занятия
      // ближе leadMinutes до начала, а lesson_link-рассылка создаётся заранее,
      // за leadMinutes + settings.previewMinutes (docs/PLAN.md §6) — между
      // этими границами есть previewMinutes минут (дефолт 5), где рассылка на
      // занятие уже существует, а правило расписания ещё можно поменять.
      // rebuild сам решает, есть ли что приводить в соответствие, и логирует
      // свой сбой внутри — он не должен останавливать согласование остальных
      // занятий класса.
      await this.lessonLinkRebuild.rebuild(move.id, now);
    }
    const created = await insertMissing(this.lessonModel, cls._id, plan.toInsert);
    return { created, removed };
  }
}
