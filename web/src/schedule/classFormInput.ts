// Чистая логика формы занятия — состояние, валидация и сборка тела запроса,
// вынесены из useClassForm.ts, чтобы проверять без React (CLAUDE.md
// «Тесты»). Числовые поля (durationMin, leadMinutes) хранятся в форме
// строкой — иначе пустое поле мгновенно становится 0 при Number(''), и
// пользователь не может стереть цифру, чтобы напечатать новую (ревью п.10).
// CreateClassInput не допускает null у zoomLink/zoomPassword — при создании
// пустое поле не отправляем вовсе (undefined); при правке существующего
// занятия пустое поле — явный сброс (null, NULLABLE_CLASS_FIELDS в
// shared/src/classes.ts), не «оставить как было» (ревью п.8). Теги курса —
// постоянный признак (ADR-0072), строкой через запятую (tagsText), тот же
// приём и тот же parseTagsText, что у materials/materialFormInput.ts —
// второй разбор строки не заводим.
import {
  CLASS_LIMITS,
  DEFAULT_LEAD_MINUTES,
  parseTagsText,
  RULE_TIME_RE,
  SCHOOL_TZ,
  TAG_LIMITS,
  type ChannelDto,
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
  /** id учителя из GET /users/teachers, пустая строка — «не указан»
   * (LeaderField, аудит В4). Сервер проверяет, что это существующий
   * teacher/admin (assertTeacherExists) — форма отправляет id как есть. */
  leaderId: string;
  /** Постоянные теги курса — «начинающие», «медитация» (ADR-0072), не теги
   * конкретной даты (те живут у lessons, форма занятия их не видит). */
  tagsText: string;
}

/** Каналы, которые сервер подставит новому занятию по умолчанию
 * (ClassesService.create — активные Telegram-каналы, docs/adr/0015): форма
 * отмечает их заранее, чтобы список чекбоксов не расходился с тем, что
 * реально уйдёт в POST (учитель видит и может снять отметку до сохранения). */
function defaultChannelIds(channels: ChannelDto[]): string[] {
  return channels.filter((c) => c.type === 'telegram' && c.active).map((c) => c.id);
}

export function initialClassFormState(
  classDto: ClassDto | null,
  channels: ChannelDto[] = [],
): ClassFormState {
  return {
    title: classDto?.title ?? '',
    groupLabel: classDto?.groupLabel ?? '',
    format: classDto?.format ?? 'online',
    zoomLink: classDto?.zoomLink ?? '',
    zoomPassword: classDto?.zoomPassword ?? '',
    leadMinutesText: String(classDto?.leadMinutes ?? DEFAULT_LEAD_MINUTES),
    active: classDto?.active ?? true,
    tz: classDto?.tz ?? SCHOOL_TZ,
    channelIds: classDto?.channelIds ?? defaultChannelIds(channels),
    leaderId: classDto?.leaderId ?? '',
    tagsText: classDto?.tags.join(', ') ?? '',
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
  // Сервер такой тег отклонит (`@MaxLength`, ADR-0072) — форма ловит раньше,
  // тот же приём, что у materialFormInput.ts.
  const longTag = parseTagsText(state.tagsText).find(
    (tag) => tag.length > TAG_LIMITS.length,
  );
  if (longTag) {
    return `Тег «${longTag}» длиннее ${TAG_LIMITS.length} символов. Сократите его.`;
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
    leaderId: state.leaderId || undefined,
    leadMinutes: Number(state.leadMinutesText),
    active: state.active,
    tz: state.tz,
    channelIds: state.channelIds,
    tags: parseTagsText(state.tagsText),
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
    // Пустой вариант «— не указан —» — явный сброс (null, leaderId входит в
    // NULLABLE_CLASS_FIELDS), не «оставить как было» (ревью п.8, как у
    // zoomLink/zoomPassword выше).
    leaderId: state.leaderId || null,
    leadMinutes: Number(state.leadMinutesText),
    active: state.active,
    tz: state.tz,
    channelIds: state.channelIds,
    tags: parseTagsText(state.tagsText),
    rules: toRules(state.rules),
  };
}
