// Билдеры апдейта `bot_sessions` для ожидания записи («Запись?», PLAN.md §6)
// — вынесено из bot-session.service.ts тем же приёмом, что payment-wait.ts:
// саму запись делает BotSessionService («единственная точка записи»), здесь
// — чистая функция, ЧТО записать.
import type { DateTime } from 'luxon';
import { Types } from 'mongoose';

// «Запись?» ждёт долго — снять запись можно не сразу (EXAM_ANSWER_WAIT_HOURS
// в exam-answer-wait.ts — то же число для ответа на вопрос экзамена, по той же
// причине). То же окно — у списка «ещё жду запись» (recording-pending.ts):
// занятие, о котором бот спросил раньше, в кнопки выбора уже не попадает.
export const RECORDING_WAIT_HOURS = 12;

export interface RecordingWaitUpdate {
  kind: 'recording';
  lessonId: Types.ObjectId;
  expiresAt: Date;
  recordingUrl: null;
  recordingFileId: null;
}

/** Новое ожидание записи — присланный, но ещё не разложенный по занятиям
 * источник (recordingSourceUpdate) при этом сбрасывается: учитель уже
 * получил новый вопрос, старую ссылку кнопками выбора не достать. */
export function recordingWaitUpdate(
  lessonId: string,
  now: DateTime,
): RecordingWaitUpdate {
  return {
    kind: 'recording',
    lessonId: new Types.ObjectId(lessonId),
    expiresAt: now.plus({ hours: RECORDING_WAIT_HOURS }).toJSDate(),
    recordingUrl: null,
    recordingFileId: null,
  };
}

export interface RecordingSourceUpdate {
  recordingUrl: string | null;
  recordingFileId: string | null;
}

/** Источник записи, присланный, когда записи ждут несколько занятий (ADR-0175):
 * лежит на сессии до нажатия кнопки «К какому занятию?» (recpick). Отсутствие
 * поля — `null`, не пропуск: иначе ссылка от прошлого выбора пережила бы
 * присланное следом видео (та же причина, что у month в payment-wait.ts). */
export function recordingSourceUpdate(source: {
  url?: string;
  telegramFileId?: string;
}): RecordingSourceUpdate {
  return {
    recordingUrl: source.url ?? null,
    recordingFileId: source.telegramFileId ?? null,
  };
}
