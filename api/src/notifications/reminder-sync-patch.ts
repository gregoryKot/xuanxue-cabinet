// Запись выбора напоминаний (ADR-0185, контракт Workshop reminder-sync): чистая
// проверка тела `PATCH /me/notifications/lessons/sync` и чистый переход состояния.
//
// Почему не DTO с class-validator, как требует CLAUDE.md, правило 3: тело —
// размеченное объединение (`kind` решает, какие поля обязательны), контракт
// требует отказа на любом лишнем поле на любом уровне, а `ValidationPipe`
// с `whitelist` лишнее вырезает или перебирает по классу, а не по `kind`. К тому
// же повтор ключа JSON виден только в сыром тексте (common/strict-json.ts),
// после `JSON.parse` его уже нет. Контракт тела — тип `ReminderSyncPatch` в
// shared, расхождение ловит `tsc`, а владение проверяет e2e.
import {
  REMINDER_SYNC_LEAD_CHOICES,
  REMINDER_SYNC_MAX_CHANGES,
  REMINDER_SYNC_VERSION,
  type ReminderChange,
  type ReminderLeadMinutes,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';

/** Текущее состояние выбора человека — то, что меняет запись. */
export interface ReminderState {
  classIds: string[];
  lessonIds: string[];
  leadMinutes: number | null;
}

const ID_RE = /^[0-9a-f]{24}$/;
const PATCH_FIELDS = ['changes', 'version'];
const SELECTION_FIELDS = ['id', 'kind', 'selected'];
const LEAD_FIELDS = ['kind', 'minutes'];

const INVALID_BODY_MESSAGE =
  'Запрос на изменение напоминаний составлен неверно. Исправьте его и отправьте снова.';

function invalid(detail: string): never {
  throw new InvalidInputError(`${INVALID_BODY_MESSAGE} ${detail}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Поля объекта — ровно ожидаемый набор: ни лишних, ни пропущенных. */
function hasExactFields(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((k, i) => k === expected[i]);
}

function isLeadMinutes(value: unknown): value is ReminderLeadMinutes {
  return (REMINDER_SYNC_LEAD_CHOICES as readonly unknown[]).includes(value);
}

function parseChange(value: unknown, position: number): ReminderChange {
  const where = `Изменение ${position}:`;
  if (!isRecord(value)) return invalid(`${where} это не объект.`);
  const { kind } = value;
  if (kind === 'lead') {
    if (!hasExactFields(value, LEAD_FIELDS)) {
      return invalid(`${where} для «lead» нужны только kind и minutes.`);
    }
    const { minutes } = value;
    if (minutes !== null && !isLeadMinutes(minutes)) {
      return invalid(`${where} minutes — одно из 0, 15, 30, 60, 120 или null.`);
    }
    // `-0` проходит проверку списка (0 === -0), но в базу и в снимок должен
    // лечь обычный ноль.
    return { kind, minutes: minutes === 0 ? 0 : minutes };
  }
  if (kind !== 'class' && kind !== 'lesson') {
    return invalid(`${where} kind — class, lesson или lead.`);
  }
  if (!hasExactFields(value, SELECTION_FIELDS)) {
    return invalid(`${where} нужны только kind, id и selected.`);
  }
  const { id, selected } = value;
  if (typeof id !== 'string' || !ID_RE.test(id)) {
    return invalid(`${where} id — 24 знака 0-9 a-f.`);
  }
  if (typeof selected !== 'boolean')
    return invalid(`${where} selected — true или false.`);
  return { kind, id, selected };
}

/** Ключ изменения: у выбора — вид и id, у минут — одно скалярное поле. */
function changeKey(change: ReminderChange): string {
  return change.kind === 'lead' ? 'lead' : `${change.kind}:${change.id}`;
}

/** Проверяет тело целиком и отдаёт типизированные изменения; первое же
 * нарушение — `InvalidInputError`, запись не начинается. Повтор ключа JSON
 * отклоняется раньше, при разборе текста. */
export function parseReminderPatch(value: unknown): ReminderChange[] {
  if (!isRecord(value) || !hasExactFields(value, PATCH_FIELDS)) {
    return invalid('В теле нужны только version и changes.');
  }
  if (value.version !== REMINDER_SYNC_VERSION) {
    return invalid(`Поддерживается version ${REMINDER_SYNC_VERSION}.`);
  }
  const { changes } = value;
  if (!Array.isArray(changes)) return invalid('changes — список.');
  if (changes.length < 1 || changes.length > REMINDER_SYNC_MAX_CHANGES) {
    return invalid(`В запросе от 1 до ${REMINDER_SYNC_MAX_CHANGES} изменений.`);
  }
  const parsed = changes.map((change, index) => parseChange(change, index + 1));
  const keys = new Set(parsed.map(changeKey));
  if (keys.size !== parsed.length) return invalid('Один выбор указан дважды.');
  return parsed;
}

/** Применяет изменения к состоянию. Ключи в пакете разные, поэтому порядок
 * изменений на результат не влияет. `changed` — изменилось ли хоть что-то:
 * снятие невыбранного и повтор сохранённого значения изменением не считаются. */
export function applyReminderChanges(
  state: ReminderState,
  changes: readonly ReminderChange[],
): { next: ReminderState; changed: boolean } {
  const classes = new Set(state.classIds);
  const lessons = new Set(state.lessonIds);
  let leadMinutes = state.leadMinutes;
  let changed = false;

  for (const change of changes) {
    if (change.kind === 'lead') {
      changed ||= change.minutes !== leadMinutes;
      leadMinutes = change.minutes;
      continue;
    }
    const target = change.kind === 'class' ? classes : lessons;
    if (change.selected === target.has(change.id)) continue;
    if (change.selected) target.add(change.id);
    else target.delete(change.id);
    changed = true;
  }

  return {
    // Сортировка по кодовым единицам — тот же порядок, что у снимка.
    next: { classIds: [...classes].sort(), lessonIds: [...lessons].sort(), leadMinutes },
    changed,
  };
}
