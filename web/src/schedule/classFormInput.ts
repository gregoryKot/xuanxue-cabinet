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
  SCHOOL_TZ,
  type ClassDto,
  type ClassFormat,
  type CreateClassInput,
  type UpdateClassInput,
} from '@xuanxue/shared';
import { ALL_GROUPS_CHOICE, NO_GROUP_CHOICE } from '../groups/groupChoice';
import { isValidInt } from '../exams/examQuestions';
import { longTagError } from '../lib/longTagError';
import {
  draftsToRules,
  ruleToDraft,
  validateRuleDrafts,
  type RuleDraft,
} from './ruleDraft';

export interface ClassFormState {
  title: string;
  /** Выбор радио «Группа» (ADR-0195): id группы, `ALL_GROUPS_CHOICE` — «все
   * группы», пустая строка — «без группы». Подпись для постов сервер берёт из
   * названия группы сам. */
  groupChoice: string;
  format: ClassFormat;
  zoomLink: string;
  zoomPassword: string;
  leadMinutesText: string;
  active: boolean;
  tz: string;
  rules: RuleDraft[];
  /** id учителя из GET /users/teachers, пустая строка — «не указан»
   * (LeaderField, аудит В4). Сервер проверяет, что это существующий
   * teacher/admin (assertTeacherExists) — форма отправляет id как есть. */
  leaderId: string;
  /** Постоянные теги курса — «начинающие», «медитация» (ADR-0072), не теги
   * конкретной даты (те живут у lessons, форма занятия их не видит). */
  tagsText: string;
}

/** Радио «Группа» → тело запроса: «все группы» — флаг, а не id (ADR-0195). */
function groupFields(choice: string): Pick<UpdateClassInput, 'groupId' | 'forAllGroups'> {
  const forAllGroups = choice === ALL_GROUPS_CHOICE;
  return {
    groupId: choice === NO_GROUP_CHOICE || forAllGroups ? null : choice,
    forAllGroups,
  };
}

function groupChoiceOf(classDto: ClassDto | null): string {
  if (classDto?.forAllGroups) return ALL_GROUPS_CHOICE;
  return classDto?.groupId ?? NO_GROUP_CHOICE;
}

export function initialClassFormState(classDto: ClassDto | null): ClassFormState {
  return {
    title: classDto?.title ?? '',
    groupChoice: groupChoiceOf(classDto),
    format: classDto?.format ?? 'online',
    zoomLink: classDto?.zoomLink ?? '',
    zoomPassword: classDto?.zoomPassword ?? '',
    leadMinutesText: String(classDto?.leadMinutes ?? DEFAULT_LEAD_MINUTES),
    active: classDto?.active ?? true,
    tz: classDto?.tz ?? SCHOOL_TZ,
    leaderId: classDto?.leaderId ?? '',
    tagsText: classDto?.tags.join(', ') ?? '',
    rules: classDto?.rules.map(ruleToDraft) ?? [],
  };
}

/** `null` — форма валидна, иначе текст первой найденной ошибки. */
export function validateClassForm(state: ClassFormState): string | null {
  if (!state.title.trim()) return 'Впишите название занятия.';
  if (state.rules.length === 0) return 'Добавьте хотя бы один день.';
  const ruleError = validateRuleDrafts(state.rules);
  if (ruleError !== null) return ruleError;
  if (!isValidInt(state.leadMinutesText, 0, CLASS_LIMITS.leadMinutesMax)) {
    return `За сколько минут слать — целое число от 0 до ${CLASS_LIMITS.leadMinutesMax}.`;
  }
  // Почему длину тега проверяем на клиенте — шапка lib/longTagError.ts, тот
  // же приём, что у materialFormInput.ts.
  return longTagError(state.tagsText);
}

export function toCreateInput(state: ClassFormState): CreateClassInput {
  return {
    title: state.title.trim(),
    ...groupFields(state.groupChoice),
    format: state.format,
    zoomLink: state.zoomLink.trim() || undefined,
    zoomPassword: state.zoomPassword.trim() || undefined,
    leaderId: state.leaderId || undefined,
    leadMinutes: Number(state.leadMinutesText),
    active: state.active,
    tz: state.tz,
    tags: parseTagsText(state.tagsText),
    rules: draftsToRules(state.rules),
  };
}

export function toUpdateInput(state: ClassFormState): UpdateClassInput {
  return {
    title: state.title.trim(),
    ...groupFields(state.groupChoice),
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
    tags: parseTagsText(state.tagsText),
    rules: draftsToRules(state.rules),
  };
}
