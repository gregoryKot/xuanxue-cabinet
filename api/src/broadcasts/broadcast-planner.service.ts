// Тик планировщика рассылок: занятие «в окне» → рендер поста → broadcast +
// deliveries (docs/PLAN.md §6). Решение по занятию — decideBroadcast, запросы
// на чтение/запись — broadcast-planner.queries.ts/inserts.ts, резолв
// {ведущий} и текста — broadcast-planner.render.ts, лог cancelled-решений —
// broadcast-planner.log.ts; сервис только связывает их (CLAUDE.md «Файлы»).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { DEFAULT_LEAD_MINUTES, type TemplateKind } from '@xuanxue/shared';
import { errorMessage, errorStack } from '../common/error-info';
import { ChannelRecord } from '../channels/channel.schema';
import { ClassRecord } from '../classes/class.schema';
import { LessonRecord } from '../lessons/lesson.schema';
import { DeliveryRecord } from '../deliveries/delivery.schema';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { decideBroadcast } from './broadcast-planner.decide';
import { cancelPlanningWithLog } from './broadcast-planner.log';
import {
  findClasses,
  findDueLessons,
  type PlannerClass,
  type PlannerLesson,
} from './broadcast-planner.queries';
import { sendLessonBroadcast, type SendLessonDeps } from './broadcast-planner.send';
import { BroadcastRecord } from './broadcast.schema';

export interface BroadcastPlanResult {
  broadcasts: number;
}

@Injectable()
export class BroadcastPlannerService {
  private readonly logger = new Logger(BroadcastPlannerService.name);

  constructor(
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    @InjectModel(BroadcastRecord.name)
    private readonly broadcastModel: Model<BroadcastRecord>,
    @InjectModel(DeliveryRecord.name)
    private readonly deliveryModel: Model<DeliveryRecord>,
    @InjectModel(ChannelRecord.name) private readonly channelModel: Model<ChannelRecord>,
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
  ) {}

  async plan(now: DateTime): Promise<BroadcastPlanResult> {
    const classes = await findClasses(this.classModel);
    const lessons = await findDueLessons(this.lessonModel, classes, now);
    if (lessons.length === 0) return { broadcasts: 0 };

    const classById = new Map(classes.map((cls) => [cls._id.toString(), cls]));
    const settings = await this.settingsService.get();

    let broadcasts = 0;
    for (const lesson of lessons) {
      try {
        const cls = classById.get(lesson.classId.toString());
        const created = await this.planLesson(lesson, cls, now, settings.templates);
        if (created) broadcasts += 1;
      } catch (err) {
        // Одно занятие не блокирует остальные — тот же приём, что у
        // LessonPlannerService.plan().
        this.logger.error(
          `Планирование рассылки занятия ${lesson._id.toString()} упало: ${errorMessage(err)}`,
          errorStack(err),
        );
      }
    }
    return { broadcasts };
  }

  private async planLesson(
    lesson: PlannerLesson,
    cls: PlannerClass | undefined,
    now: DateTime,
    templates: Record<TemplateKind, string>,
  ): Promise<boolean> {
    const decision = decideBroadcast(lesson, cls, now);
    switch (decision.kind) {
      case 'not_due':
        return false;
      case 'too_late':
        // Тихий отказ — обязательно error, не warn (RUNBOOK §8.1).
        return cancelPlanningWithLog(
          this.broadcastModel,
          this.logger,
          lesson._id,
          `тик опоздал: занятие началось больше ${DEFAULT_LEAD_MINUTES} минут назад`,
          now,
          'error',
        );
      case 'skip':
        return cancelPlanningWithLog(
          this.broadcastModel,
          this.logger,
          lesson._id,
          decision.reason,
          now,
          'warn',
        );
      case 'send':
        if (!cls) {
          // decideBroadcast возвращает 'send' только когда cls определён —
          // защита от расхождения между решением и его исполнением.
          throw new Error('decideBroadcast: send без класса — расхождение логики');
        }
        return sendLessonBroadcast(this.sendDeps(), lesson, cls, now, templates);
    }
  }

  private sendDeps(): SendLessonDeps {
    return {
      channelModel: this.channelModel,
      broadcastModel: this.broadcastModel,
      deliveryModel: this.deliveryModel,
      usersService: this.usersService,
      logger: this.logger,
    };
  }
}
