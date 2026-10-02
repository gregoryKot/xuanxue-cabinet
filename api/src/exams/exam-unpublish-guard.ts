// Снять форму с публикации (published → draft/archived), пока ученик её
// сдаёт, нельзя (F10, аудит 2026-10-01): /me/exams отдаёт только published,
// и карточка «Продолжить» исчезала бы у сдающего прямо сейчас — в кабинете и
// в боте. Идущая попытка при этом остаётся валидной (start() возвращает её
// раньше assertExamPublished), но ученик её больше не находит. Удаление формы
// гард не трогает — решение владельца, ADR-0140.
//
// «Идёт сейчас» — `in_progress` и дедлайн ещё не наступил (или его нет:
// форма без лимита времени). Просроченную, которую тик ещё не закрыл,
// считать живой нельзя: она ждёт только закрытия.
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { pluralRu, type ExamStatus } from '@xuanxue/shared';
import { ConflictError } from '../common/errors';
import type { ExamAttemptRecord } from './exam-attempt.schema';

const STUDENT_FORMS = {
  one: 'ученик',
  few: 'ученика',
  many: 'учеников',
  other: 'ученика',
} as const;
const TAKES_FORMS = {
  one: 'сдаёт',
  few: 'сдают',
  many: 'сдают',
  other: 'сдают',
} as const;

export function liveAttemptsMessage(count: number): string {
  return (
    `Экзамен сейчас ${pluralRu(count, TAKES_FORMS)} ${count} ` +
    `${pluralRu(count, STUDENT_FORMS)}. Дождитесь сдачи или удалите форму.`
  );
}

export function isUnpublishing(from: ExamStatus, to: ExamStatus | undefined): boolean {
  return from === 'published' && to !== undefined && to !== 'published';
}

export async function assertNoLiveAttempts(
  attemptModel: Model<ExamAttemptRecord>,
  examId: string,
  now: DateTime,
): Promise<void> {
  const live = await attemptModel.countDocuments({
    examId,
    status: 'in_progress',
    // `null` в фильтре матчит и отсутствующее поле, и явный null.
    $or: [{ deadlineAt: null }, { deadlineAt: { $gt: now.toJSDate() } }],
  });
  if (live > 0) throw new ConflictError(liveAttemptsMessage(live));
}
