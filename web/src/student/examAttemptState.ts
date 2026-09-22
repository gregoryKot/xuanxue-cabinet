// Тексты кабинета про положение ученика по одному экзамену (ТЗ п.1) — чистая
// логика без DOM и без сети, юнит-тест на все ветки (CLAUDE.md «Тесты»). Три
// возможных статуса попытки (EXAM_ATTEMPT_STATUSES) дают ровно три
// формулировки — «вы отвечаете» показывать не нужно отдельно: карточка
// вместо неё рисует кнопку «Продолжить».
//
// Какую кнопку показать (или не показывать вовсе) — не здесь: правило одно
// на кабинет и на бота, `getMyExamAction` в shared/src/my-exams.ts
// (ADR-0091). Раньше оно жило тут же под именем `getExamAction` и
// разъезжалось с тем, что решал бот, — с переездом в shared разъехаться
// негде: экраны читают одну функцию.
import {
  pluralRu,
  myExamAttemptsLeft,
  SCHOOL_TZ,
  type GradingOutcome,
  type MyExamDto,
} from '@xuanxue/shared';
import { tzBadge } from '../schedule/timezoneLabel';

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
 * доработать, — а что именно, ученик увидит в комментарии учителя рядом
 * (карточка его уже показывает).
 */
const OUTCOME_TEXT: Record<GradingOutcome, string> = {
  passed: 'Экзамен сдан',
  failed: 'Экзамен не сдан',
  needs_work: 'Нужно доработать',
};

export function describeOutcome(outcome: GradingOutcome): string {
  return OUTCOME_TEXT[outcome];
}

/** «Осталось 2 попытки» / «Попытки закончились» — вторая форма честная, а не
 * «0 попыток» (CLAUDE.md «Продуктовая фича = число»). */
export function formatAttemptsLeft(exam: MyExamDto): string {
  const left = myExamAttemptsLeft(exam);
  if (left === 0) return 'Попытки закончились';
  return `Осталось ${left} ${pluralRu(left, ATTEMPT_FORMS)}`;
}

/** Честная строка вместо кнопки — состояние последней попытки простыми
 * словами (ТЗ п.1) или, если попытки не было вовсе, почему кнопки нет.
 *
 * Ветка «graded» — запасной вариант: StudentExamCard.tsx для проверенной
 * попытки с оценкой рисует не эту строку, а `describeOutcome` с комментарием
 * учителя (ТЗ п.2, слой 4.7) — тот заголовок уже говорит, что экзамен
 * проверен, и повторять это здесь было бы лишним. Текст ниже остаётся на
 * случай, если попытка помечена проверенной, а оценки в ответе почему-то ещё
 * нет (защита от рассинхрона данных, не ожидаемый путь). */
export function describeNoAction(exam: MyExamDto): string {
  if (exam.lastAttempt?.status === 'graded') return 'Экзамен проверен';
  if (exam.lastAttempt?.status === 'submitted') return 'Отправлено, ждём проверки';
  return 'Попыток по этому экзамену пока нет';
}

/** Чьи часы стоят в «попытка закроется в 19:40» (ADR-0060: время показываем
 * по часам устройства зрителя, рядом называем пояс школы, если он другой).
 * `null` — зритель и школа живут по одним часам, называть нечего: приписка у
 * каждой карточки превратила бы список в частокол «Asia/Jerusalem», ровно то,
 * от чего ушли подписи расписания (schedule/timezoneLabel.ts).
 *
 * Сам пояс школы — константа SCHOOL_TZ, не `settings.tz`: экран ученика
 * настройки школы не грузит, а дедлайн попытки и так абсолютный момент —
 * пояс здесь отвечает только за то, по каким часам прочитан показанный час. */
export function examTimeZoneNote(browserTimeZone?: string): string | null {
  const schoolTz = tzBadge(SCHOOL_TZ, browserTimeZone);
  return schoolTz ? `по вашим часам (школа живёт по ${schoolTz})` : null;
}
