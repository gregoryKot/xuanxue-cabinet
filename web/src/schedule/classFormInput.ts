// Чистая логика формы занятия — состояние, валидация и сборка тела запроса,
// вынесены из useClassForm.ts, чтобы проверять без React (CLAUDE.md
// «Тесты»). Числовые поля (durationMin, leadMinutes) хранятся в форме
// строкой — иначе пустое поле мгновенно становится 0 при Number(''), и
// пользователь не может стереть цифру, чтобы напечатать новую (ревью п.10).
// CreateClassInput не допускает null у zoomLink/zoomPassword — при создании
// пустое поле не отправляем вовсе (undefined); при правке существующего
// занятия пустое поле — явный сброс (null, NULLABLE_CLASS_FIELDS в
// shared/src/classes.ts), не «оставить как было» (ревью п.8).
import {
  CLASS_LIMITS,
  DEFAULT_LEAD_MINUTES,
  RULE_TIME_RE,
  SCHOOL_TZ,
  type ClassDto,
  type ClassFormat,
  type CreateClassInput,
  type ScheduleRuleInput,
  type UpdateClassInput,
  type Weekday,
} from '@xuanxue/shared';

export interface RuleDraft {
  id?: string;
  weekday: Weekday;
  time: string;
  durationMinText: string;
}

export interface ClassFormState {
  title: string;
  groupLabel: string;
  format: ClassFormat;
  zoomLink: string;
  zoomPassword: string;
  leadMinutesText: string;
  active: boolean;
  tz: string;
  rules: RuleDraft[];
  /** Каналы рассылки для этого занятия (ревью п.1, docs/PLAN.md §6 п.1) —
   * ссылка и запись уходят только сюда; Telegram-группа с ботом
   * подключается ко всем занятиям сама, отдельно от этого списка. */
  channelIds: string[];
}

export function initialClassFormState(classDto: ClassDto | null): ClassFormState {
  return {
    title: classDto?.title ?? '',
    groupLabel: classDto?.groupLabel ?? '',
    format: classDto?.format ?? 'online',
    zoomLink: classDto?.zoomLink ?? '',
    zoomPassword: classDto?.zoomPassword ?? '',
    leadMinutesText: String(classDto?.leadMinutes ?? DEFAULT_LEAD_MINUTES),
    active: classDto?.active ?? true,
    tz: classDto?.tz ?? SCHOOL_TZ,
    channelIds: classDto?.channelIds ?? [],
    rules:
      classDto?.rules.map((rule) => ({
        id: rule.id,
        weekday: rule.weekday,
        time: rule.time,
        durationMinText: String(rule.durationMin),
      })) ?? [],
  };
}

function isValidInt(text: string, min: number, max: number): boolean {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= min && value <= max;
}

/** `null` — форма валидна, иначе текст первой найденной ошибки. */
export function validateClassForm(state: ClassFormState): string | null {
  if (!state.title.trim()) return 'Впишите название занятия.';
  if (state.rules.length === 0) return 'Добавьте хотя бы один день.';
  for (const rule of state.rules) {
    if (!RULE_TIME_RE.test(rule.time)) return 'Выберите время для каждого дня.';
    if (
      !isValidInt(
        rule.durationMinText,
        CLASS_LIMITS.durationMinMin,
        CLASS_LIMITS.durationMinMax,
      )
    ) {
      return `Длительность — целое число от ${CLASS_LIMITS.durationMinMin} до ${CLASS_LIMITS.durationMinMax} минут.`;
    }
  }
  if (!isValidInt(state.leadMinutesText, 0, CLASS_LIMITS.leadMinutesMax)) {
    return `За сколько минут слать — целое число от 0 до ${CLASS_LIMITS.leadMinutesMax}.`;
  }
  return null;
}

function toRules(rules: RuleDraft[]): ScheduleRuleInput[] {
  return rules.map((rule) => ({
    id: rule.id,
    weekday: rule.weekday,
    time: rule.time,
    durationMin: Number(rule.durationMinText),
  }));
}

export function toCreateInput(state: ClassFormState): CreateClassInput {
  return {
    title: state.title.trim(),
    groupLabel: state.groupLabel.trim() || undefined,
    format: state.format,
    zoomLink: state.zoomLink.trim() || undefined,
    zoomPassword: state.zoomPassword.trim() || undefined,
    leadMinutes: Number(state.leadMinutesText),
    active: state.active,
    tz: state.tz,
    channelIds: state.channelIds,
    rules: toRules(state.rules),
  };
}

export function toUpdateInput(state: ClassFormState): UpdateClassInput {
  return {
    title: state.title.trim(),
    groupLabel: state.groupLabel.trim() || undefined,
    format: state.format,
    zoomLink: state.zoomLink.trim() || null,
    zoomPassword: state.zoomPassword.trim() || null,
    leadMinutes: Number(state.leadMinutesText),
    active: state.active,
    tz: state.tz,
    channelIds: state.channelIds,
    rules: toRules(state.rules),
  };
}
