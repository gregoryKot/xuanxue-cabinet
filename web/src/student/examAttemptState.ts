// Положение ученика по одному экзамену (ТЗ п.1) — чистая логика без DOM и
// без сети, юнит-тест на все ветки (CLAUDE.md «Тесты»). Три возможных
// статуса попытки (EXAM_ATTEMPT_STATUSES) дают ровно три формулировки —
// «вы отвечаете» показывать не нужно отдельно: карточка вместо неё рисует
// кнопку «Продолжить».
import {
  pluralRu,
  type GradingCriterionDto,
  type GradingOutcome,
  type MyExamDto,
} from '@xuanxue/shared';

const ATTEMPT_FORMS = {
  one: 'попытка',
  few: 'попытки',
  many: 'попыток',
  other: 'попытки',
} as const;

/** Итог проверки человеческими словами (ТЗ п.2, слой 4.7) — заголовок на
 * карточке ученика. Не путать с GRADING_OUTCOME_LABELS_RU в
 * grading/gradingFormInput.ts: там подпись для выпадающего списка учителя
 * («Сдал»), здесь — фраза для читателя-ученика о предмете («Экзамен сдан»),
 * третье лицо, без «вы»: согласование по роду и числу тут не нужно
 * (docs/VOICE.md «Форма „вы“»). needs_work прямо называет действие —
 * доработать, — а что именно, ученик увидит в баллах по критериям и
 * комментарии учителя рядом (карточка их уже показывает).
 */
const OUTCOME_TEXT: Record<GradingOutcome, string> = {
  passed: 'Экзамен сдан',
  failed: 'Экзамен не сдан',
  needs_work: 'Нужно доработать',
};

export function describeOutcome(outcome: GradingOutcome): string {
  return OUTCOME_TEXT[outcome];
}

/** «Устойчивость и центр: 4 из 5» — баллы по критерию своей же попытки, не
 * критерий вопроса (ТЗ п.1, границы в shared/src/my-exams.ts). Без слова
 * «баллов»: цифра и «из» уже читаются однозначно, лишнее слово — шум. */
export function formatCriterionScore(criterion: GradingCriterionDto): string {
  return `${criterion.title}: ${criterion.score} из ${criterion.maxScore}`;
}

export type ExamCardAction = 'continue' | 'start' | 'retry' | null;

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
 * Одна кнопка по смыслу (ТЗ п.1): попытка в работе — «Продолжить»; работу
 * проверили, а попытки ещё остались — «Пройти ещё раз»; попытки ещё не было —
 * «Начать»; в остальных случаях (сдано и ждёт проверки, попытки кончились) —
 * кнопки нет.
 *
 * «Пройти ещё раз» появился со слоем 4.7: учитель ставит итог «нужно
 * доработать», и ученику надо куда-то нажать — иначе разбор упирается в
 * тупик. API это и так разрешает (`ExamAttemptsService.start` пускает, пока
 * `attemptsUsed < attemptsAllowed`), кабинет просто не показывал.
 * Сданную, но ещё не проверенную попытку не перезапускаем: пока учитель не
 * посмотрел работу, вторая попытка — не «доработка», а обход проверки.
 */
export function getExamAction(exam: MyExamDto): ExamCardAction {
  if (exam.lastAttempt?.status === 'in_progress') return 'continue';
  if (getAttemptsLeft(exam) <= 0) return null;
  if (exam.lastAttempt?.status === 'graded') return 'retry';
  return exam.lastAttempt ? null : 'start';
}

/** Честная строка вместо кнопки — состояние последней попытки простыми
 * словами (ТЗ п.1) или, если попытки не было вовсе, почему кнопки нет.
 *
 * Ветка «graded» — запасной вариант: StudentExamCard.tsx для проверенной
 * попытки с оценкой рисует не эту строку, а `describeOutcome` с баллами и
 * комментарием (ТЗ п.2, слой 4.7) — тот заголовок уже говорит, что экзамен
 * проверен, и повторять это здесь было бы лишним. Текст ниже остаётся на
 * случай, если попытка помечена проверенной, а оценки в ответе почему-то ещё
 * нет (защита от рассинхрона данных, не ожидаемый путь). */
export function describeNoAction(exam: MyExamDto): string {
  if (exam.lastAttempt?.status === 'graded') return 'Экзамен проверен';
  if (exam.lastAttempt?.status === 'submitted') return 'Отправлено, ждём проверки';
  return 'Учитель пока не открыл ни одной попытки';
}
