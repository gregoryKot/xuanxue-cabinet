// Текст подтверждения записи бота (docs/PLAN.md §6 «Записи») — называет
// занятие: учитель, ведущий несколько групп, должен видеть, куда именно
// сохранилась запись, не только факт «сохранена». Вынесено из
// message.handler.ts, чтобы файл-лимит 150 строк (CLAUDE.md «Храповики»)
// не заставлял ужимать саму логику потока.
import { DateTime } from 'luxon';
import { Types, type Model } from 'mongoose';
import { SCHOOL_TZ, type LessonDto } from '@xuanxue/shared';
import type { BroadcastRecord } from '../../broadcasts/broadcast.schema';
import type { ClassRecord } from '../../classes/class.schema';

export async function buildRecordingConfirmation(
  classModel: Model<ClassRecord>,
  broadcastModel: Model<BroadcastRecord>,
  lesson: LessonDto,
): Promise<string> {
  const [cls, sent] = await Promise.all([
    classModel.findById(lesson.classId, { title: 1, tz: 1 }).lean<{
      title: string;
      tz: string;
    } | null>(),
    recordingBroadcastSent(broadcastModel, new Types.ObjectId(lesson.id)),
  ]);
  const title = cls?.title ?? '';
  const time = DateTime.fromISO(lesson.startsAt, { zone: 'utc' })
    .setZone(cls?.tz ?? SCHOOL_TZ)
    .toFormat('HH:mm');
  const tail = sent ? 'рассылка ушла' : 'рассылка ждёт отправки';
  return `Запись сохранена к занятию «${title}» ${time}, ${tail}.`;
}

async function recordingBroadcastSent(
  broadcastModel: Model<BroadcastRecord>,
  lessonId: Types.ObjectId,
): Promise<boolean> {
  const broadcast = await broadcastModel
    .findOne({ lessonId, kind: 'recording' }, { status: 1 })
    .sort({ createdAt: -1 })
    .lean<{ status: string } | null>();
  return broadcast?.status === 'sent';
}
