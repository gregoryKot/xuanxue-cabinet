// Положение ученика по одному экзамену (ТЗ п.1) — чистая логика без DOM и
// без сети, юнит-тест на все ветки (CLAUDE.md «Тесты»). Три возможных
// статуса попытки (EXAM_ATTEMPT_STATUSES) дают ровно три формулировки —
// «вы отвечаете» показывать не нужно отдельно: карточка вместо неё рисует
// кнопку «Продолжить».
import { pluralRu, type MyExamDto } from '@xuanxue/shared';

const ATTEMPT_FORMS = {
  one: 'попытка',
  few: 'попытки',
  many: 'попыток',
  other: 'попытки',
} as const;

export type ExamCardAction = 'continue' | 'start' | null;

export function getAttemptsLeft(exam: MyExamDto): number {
  return Math.max(0, exam.attemptsAllowed - exam.attemptsUsed);
}

/** «Осталось 2 попытки» / «Попытки закончились» — вторая форма честная, а не
 * «0 попыток» (CLAUDE.md «Продуктовая фича = число»). */
export function formatAttemptsLeft(exam: MyExamDto): string {
  const left = getAttemptsLeft(exam);
  if (left === 0) return 'Попытки закончились';
  return `Осталось ${left} ${pluralRu(left, ATTEMPT_FORMS)}`;
}

/**
 * Одна кнопка по смыслу (ТЗ п.1): попытка в работе — «Продолжить»; попыток не
 * осталось или последняя уже отправлена/проверена — кнопки нет вовсе; иначе
 * (попытки ещё не было, есть куда её начать) — «Начать».
 *
 * Учитель может увеличить `attemptsAllowed` уже после того, как ученик сдал
 * единственную попытку — по API это открывает вторую (ExamAttemptsService.
 * start считает только `attemptsUsed < attemptsAllowed`). Здесь эта комбинация
 * сознательно не отдельная ветка: ТЗ описывает решение ровно тремя пунктами,
 * и «последняя отправлена» в них — терминальное состояние без исключений.
 * Открыть новую попытку в этом случае можно только когда `lastAttempt`
 * пропадёт из ответа API — то есть отдельным действием учителя, которого
 * сейчас нет ни в API, ни в ТЗ.
 */
export function getExamAction(exam: MyExamDto): ExamCardAction {
  if (exam.lastAttempt?.status === 'in_progress') return 'continue';
  if (getAttemptsLeft(exam) <= 0 || exam.lastAttempt) return null;
  return 'start';
}

/** Честная строка вместо кнопки — состояние последней попытки простыми
 * словами (ТЗ п.1) или, если попытки не было вовсе, почему кнопки нет. */
export function describeNoAction(exam: MyExamDto): string {
  if (exam.lastAttempt?.status === 'graded') return 'Экзамен проверен';
  if (exam.lastAttempt?.status === 'submitted') return 'Отправлено, ждём проверки';
  return 'Учитель пока не открыл ни одной попытки';
}
