// Тема недели (ADR-0197): один текст в несколько занятий. Запись идёт тем же
// updateLesson, что и PATCH одной даты, — шифрование и пересборка ещё не
// ушедшего поста не дублируются (CLAUDE.md «Одна механика — один компонент»).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import type { LessonDto, SetLessonsTopicInput } from '@xuanxue/shared';
import { LessonLinkRebuildService } from '../broadcasts/lesson-link-rebuild.service';
import { NotFoundError } from '../common/errors';
import { UserRecord } from '../users/user.schema';
import { updateLesson } from './lesson-update';
import { LessonRecord } from './lesson.schema';
import { LESSON_NOT_FOUND, assertLessonId } from './lessons.queries';

@Injectable()
export class LessonsTopicService {
  constructor(
    @InjectModel(LessonRecord.name) private readonly model: Model<LessonRecord>,
    @InjectModel(UserRecord.name) private readonly userModel: Model<UserRecord>,
    private readonly lessonLinkRebuild: LessonLinkRebuildService,
  ) {}

  async setTopic(input: SetLessonsTopicInput, now: DateTime): Promise<LessonDto[]> {
    const ids = [...new Set(input.lessonIds)];
    ids.forEach(assertLessonId);
    // Проверка до записи: неизвестный id не должен оставить половину недели с новой темой.
    const found = await this.model.countDocuments({ _id: { $in: ids } });
    if (found !== ids.length) throw new NotFoundError(LESSON_NOT_FOUND);
    const deps = {
      model: this.model,
      userModel: this.userModel,
      lessonLinkRebuild: this.lessonLinkRebuild,
    };
    const lessons: LessonDto[] = [];
    for (const id of ids) {
      lessons.push((await updateLesson(deps, id, { topic: input.topic }, now)).lesson);
    }
    return lessons;
  }
}
