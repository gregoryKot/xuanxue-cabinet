// Занятия, записи которых бот ещё ждёт (ADR-0175): спросил «Запись?» не
// раньше RECORDING_WAIT_HOURS назад, записи нет, «Записи не будет» не
// нажимали. Источник истины — сами занятия, не bot_sessions: там один
// документ на чат, и три вопроса подряд оставили бы в нём только последний
// (снимок владельца 2026-10-06, три «закончилось» в ряд).
import { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import { classDisplayName } from '@xuanxue/shared';
import type { ClassRecord } from '../../classes/class.schema';
import type { LessonRecord } from '../../lessons/lesson.schema';
import { RECORDING_WAIT_HOURS } from '../recording-wait';

// Кнопок выбора — не «дай всё» (CLAUDE.md «API»): больше занятий за полдня у
// школы не бывает, а клавиатура Telegram из десятков кнопок не читается.
const PENDING_LIMIT = 10;

export interface PendingRecording {
  id: string;
  /** «Название · группа» HH:mm — подпись кнопки и строка «ещё жду». */
  label: string;
}

interface PendingLessonRow {
  _id: Types.ObjectId;
  classId: Types.ObjectId;
  startsAt: Date;
}

interface PendingClassRow {
  _id: Types.ObjectId;
  title: string;
  groupLabel?: string;
  tz: string;
}

export async function listPendingRecordings(
  lessonModel: Model<LessonRecord>,
  classModel: Model<ClassRecord>,
  now: DateTime,
): Promise<PendingRecording[]> {
  const lessons = await lessonModel
    .find(
      {
        status: 'scheduled',
        recordingPromptedAt: {
          $gte: now.minus({ hours: RECORDING_WAIT_HOURS }).toJSDate(),
        },
        recordingDeclinedAt: { $exists: false },
        recordings: { $size: 0 },
      },
      { classId: 1, startsAt: 1 },
    )
    .sort({ startsAt: 1 })
    .limit(PENDING_LIMIT)
    .lean<PendingLessonRow[]>();
  if (lessons.length === 0) return [];

  const classes = await classModel
    .find(
      { _id: { $in: lessons.map((lesson) => lesson.classId) } },
      { title: 1, groupLabel: 1, tz: 1 },
    )
    .lean<PendingClassRow[]>();
  const byId = new Map(classes.map((cls) => [cls._id.toString(), cls]));

  return lessons.flatMap((lesson) => {
    const cls = byId.get(lesson.classId.toString());
    if (!cls) return []; // класс удалён — выбирать нечего
    const time = DateTime.fromJSDate(lesson.startsAt, { zone: 'utc' })
      .setZone(cls.tz)
      .toFormat('HH:mm');
    return [{ id: lesson._id.toString(), label: `«${classDisplayName(cls)}» ${time}` }];
  });
}

/** Хвост подтверждения: что бот ещё ждёт после сохранённой записи — учитель
 * с тремя занятиями подряд видит, куда слать следующую ссылку. */
export function pendingTail(pending: readonly PendingRecording[]): string {
  if (pending.length === 0) return '';
  if (pending.length === 1) return ` Ещё жду запись к ${pending[0]?.label}.`;
  return ` Ещё жду записи: ${pending.map((p) => p.label).join(', ')}.`;
}
