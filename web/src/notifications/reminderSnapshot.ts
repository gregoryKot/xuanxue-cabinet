// Разбор снимка настроек напоминаний (контракт reminder-sync, версия 1, раздел
// «Snapshot»): чистая функция без React и сети. Успешный ответ, не прошедший
// разбор, — не пустой выбор, а сбой: клиент, принявший битое тело за «ничего не
// выбрано», при следующей записи затёр бы настоящий выбор человека. Поэтому
// каждое поле проверяется по правилу контракта, а не по одному только типу;
// лишние поля верхнего уровня отбрасываются (контракт их разрешает).
import {
  REMINDER_SYNC_LEAD_CHOICES,
  REMINDER_SYNC_VERSION,
  RULE_EVERY_WEEKS,
  RULE_TIME_RE,
  SETTINGS_LIMITS,
  WEEKDAYS,
  type LessonScopeClassDto,
  type ReminderSyncSnapshot,
} from '@xuanxue/shared';

const REVISION_PATTERN = /^(0|[1-9][0-9]*)$/;
// id занятия и отдельного занятия — ObjectId Кабинета строчными hex-цифрами:
// «Class-1» или заглавные значили бы чужой ответ, а не другую запись.
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/;
// Школьное значение «за сколько напомнить» — те же границы, что у настройки
// школы на сервере: иное число сервер выдать не мог.
const SCHOOL_MINUTES_MIN = SETTINGS_LIMITS.lessonReminderMinutesMin;
const SCHOOL_MINUTES_MAX = SETTINGS_LIMITS.lessonReminderMinutesMax;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

// Без повторов и по возрастанию кодовых единиц — так сервер отдаёт множества;
// иной порядок значит ответ не по контракту, а не «разные вкусы».
function isCanonicalIds(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  let previous: string | null = null;
  for (const id of value) {
    if (!isObjectId(id) || (previous !== null && previous >= id)) return false;
    previous = id;
  }
  return true;
}

// Пояс, который браузер не знает, дал бы исключение посреди отрисовки времени
// занятия; здесь он отсекается вместе со всем снимком.
function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isSlot(value: unknown): boolean {
  return (
    isRecord(value) &&
    WEEKDAYS.some((weekday) => weekday === value.weekday) &&
    typeof value.time === 'string' &&
    RULE_TIME_RE.test(value.time) &&
    isPositiveInteger(value.durationMin) &&
    (value.everyWeeks === undefined ||
      RULE_EVERY_WEEKS.some((weeks) => weeks === value.everyWeeks))
  );
}

function isCatalogueClass(value: unknown): value is LessonScopeClassDto {
  return (
    isRecord(value) &&
    isObjectId(value.id) &&
    typeof value.title === 'string' &&
    typeof value.groupLabel === 'string' &&
    isTimeZone(value.tz) &&
    Array.isArray(value.slots) &&
    value.slots.every(isSlot)
  );
}

function isCatalogue(value: unknown): value is LessonScopeClassDto[] {
  return (
    Array.isArray(value) &&
    value.every(isCatalogueClass) &&
    isCanonicalIds(value.map((item: LessonScopeClassDto) => item.id))
  );
}

function isLeadMinutes(value: unknown): value is ReminderSyncSnapshot['leadMinutes'] {
  return value === null || REMINDER_SYNC_LEAD_CHOICES.some((choice) => choice === value);
}

function isSchoolMinutes(value: unknown): value is number {
  return isInteger(value) && value >= SCHOOL_MINUTES_MIN && value <= SCHOOL_MINUTES_MAX;
}

/** Снимок из тела ответа или `null`: поля, типы и значения по контракту, лишние
 * поля отбрасываются, пустой выбор остаётся пустым, а не «ошибкой». */
export function parseReminderSnapshot(body: unknown): ReminderSyncSnapshot | null {
  if (!isRecord(body) || body.version !== REMINDER_SYNC_VERSION) return null;
  const {
    accountId,
    revision,
    classIds,
    lessonIds,
    leadMinutes,
    schoolMinutes,
    classes,
  } = body;
  if (typeof accountId !== 'string' || accountId === '') return null;
  if (typeof revision !== 'string' || !REVISION_PATTERN.test(revision)) return null;
  if (!isCanonicalIds(classIds) || !isCanonicalIds(lessonIds)) return null;
  if (!isLeadMinutes(leadMinutes) || !isSchoolMinutes(schoolMinutes)) return null;
  if (!isCatalogue(classes)) return null;
  return {
    version: REMINDER_SYNC_VERSION,
    accountId,
    revision,
    classIds,
    lessonIds,
    leadMinutes,
    schoolMinutes,
    classes,
  };
}
