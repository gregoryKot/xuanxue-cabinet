// Правило расписания в форме занятия: черновик, проверка и сборка тела
// запроса — вынесено из classFormInput.ts, чтобы «раз в две недели» (ADR-0168)
// не раздувало файл формы (CLAUDE.md «Храповики»). Длительность хранится
// строкой: пустое поле не подменяется нулём при `Number('')` (ревью п.10).
// `startsOn` — строкой «ГГГГ-ММ-ДД», как отдаёт `<input type="date">`;
// пустая строка — «не задана».
import {
  CLASS_LIMITS,
  EVERY_TWO_WEEKS,
  EVERY_WEEK,
  RULE_TIME_RE,
  ruleRecurrenceError,
  WEEKDAY_LABELS_RU,
  type RuleEveryWeeks,
  type ScheduleRuleDto,
  type ScheduleRuleInput,
  type Weekday,
} from '@xuanxue/shared';
import { isValidInt } from '../exams/examQuestions';

export interface RuleDraft {
  id?: string;
  weekday: Weekday;
  time: string;
  durationMinText: string;
  /** Нет поля — каждую неделю. Не просто «ещё не выбрано»: черновик формы лежит
   * в localStorage до 7 суток (ADR-0052) и мог быть записан до ADR-0168, а
   * `useFormDraft` кладёт сохранённые строки правил как есть, без новых полей. */
  everyWeeks?: RuleEveryWeeks;
  startsOn?: string;
}

const DEFAULT_RULE_TIME = '19:00';
const DEFAULT_RULE_DURATION_TEXT = '60';

/** Новая строка «Добавить время»: воскресенье, каждую неделю. */
export function newRuleDraft(): RuleDraft {
  return {
    weekday: 0,
    time: DEFAULT_RULE_TIME,
    durationMinText: DEFAULT_RULE_DURATION_TEXT,
    everyWeeks: EVERY_WEEK,
    startsOn: '',
  };
}

/** У занятия, заведённого до ADR-0168, полей нет — оно еженедельное. */
export function ruleToDraft(rule: ScheduleRuleDto): RuleDraft {
  return {
    id: rule.id,
    weekday: rule.weekday,
    time: rule.time,
    durationMinText: String(rule.durationMin),
    everyWeeks: rule.everyWeeks ?? EVERY_WEEK,
    startsOn: rule.startsOn ?? '',
  };
}

/** «Пт 20:00» — по чему человек узнаёт строку правила на экране; время ещё
 * не выбрано — один день. */
function ruleName(rule: RuleDraft): string {
  const day = WEEKDAY_LABELS_RU[rule.weekday];
  return rule.time ? `${day} ${rule.time}` : day;
}

function ruleError(rule: RuleDraft): string | null {
  if (!RULE_TIME_RE.test(rule.time)) return 'Выберите время для каждого дня.';
  const { durationMinMin, durationMinMax } = CLASS_LIMITS;
  if (!isValidInt(rule.durationMinText, durationMinMin, durationMinMax)) {
    return `Длительность — целое число от ${durationMinMin} до ${durationMinMax} минут.`;
  }
  return ruleRecurrenceError(rule);
}

/** `null` — все правила в порядке, иначе текст первой ошибки. Строка правила
 * названа днём и временем, только если правил несколько: у единственного
 * непонятно разве что «какое», а «Пт 20:00:» перед каждой ошибкой — шум. */
export function validateRuleDrafts(rules: RuleDraft[]): string | null {
  for (const rule of rules) {
    const error = ruleError(rule);
    if (error === null) continue;
    return rules.length > 1 ? `${ruleName(rule)}: ${error}` : error;
  }
  return null;
}

/** Еженедельное правило уходит без `everyWeeks` и даты: сервер их не хранит
 * (ADR-0168), и отправка устаревшей даты от прежнего выбора ничего не даёт. */
export function draftsToRules(rules: RuleDraft[]): ScheduleRuleInput[] {
  return rules.map((rule) => ({
    id: rule.id,
    weekday: rule.weekday,
    time: rule.time,
    durationMin: Number(rule.durationMinText),
    ...(rule.everyWeeks === EVERY_TWO_WEEKS
      ? { everyWeeks: rule.everyWeeks, startsOn: rule.startsOn }
      : {}),
  }));
}
