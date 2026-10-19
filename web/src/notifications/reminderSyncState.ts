// Решения экрана настроек напоминаний (контракт reminder-sync, разделы «Saves,
// concurrency and uncertain outcomes» и «Failure behavior») — чистая логика без
// React и сети: что показывать, можно ли сохранять, что делать с ответом и с
// ошибкой. Хук useReminderSync.ts только исполняет эффекты и кладёт их исход
// сюда событием.
//
// Фазы. `loading` — снимка ещё нет, первое чтение. `idle` — снимок подтверждён,
// сохранять можно. `saving` — `PATCH` в пути, контролы выключены, новое
// намерение не ставится в очередь. `verifying` — исход записи неясен: сервер
// мог её принять, поэтому подтверждённый снимок остаётся прежним, а перед
// следующим сохранением выполняется одно чтение.
//
// Переходы:
//   saveStarted     idle → saving (только онлайн)
//   saveSucceeded   saving → idle с ответом; ответ не снимок или отсечён
//                   ограждением — как неясный исход
//   saveFailed      отказ (400/403/409/413/415) → idle с текстом сервера;
//                   401 → idle без текста (вход за глобальным слушателем);
//                   остальное, включая 429 → verifying
//   readSucceeded   loading|verifying → idle с ответом; не снимок или отсечён —
//                   сбой чтения
//   readFailed      loading|verifying: сбой чтения, ждём «ещё раз»
//   readRetried     снимает сбой чтения, чтение уходит заново
//   connection      онлайн/офлайн; чтение после неясного исхода ждёт сети
//
// Запись не повторяется нигде: у неясного исхода единственный выход — чтение.
// Ограждение: снимок чужого аккаунта и снимок с ревизией ниже подтверждённой
// игнорируются; равная ревизия принимается — каталог и школьное значение живут
// отдельно от ревизии выбора.
import {
  REMINDER_SYNC_LEAD_CHOICES,
  REMINDER_SYNC_VERSION,
  type LessonScopeClassDto,
  type ReminderChange,
  type ReminderSyncSnapshot,
} from '@xuanxue/shared';
import { ApiError } from '../api/http';

export type ReminderSyncPhase = 'loading' | 'idle' | 'saving' | 'verifying';

export type ReminderChangeKind = ReminderChange['kind'];

/** Определённый отказ сервера: записи не было, текст написан для человека. */
export interface ReminderRefusal {
  /** Какой контрол сохранял: отказ рисуется рядом с ним, а не у соседа. */
  kind: ReminderChangeKind;
  message: string;
}

export interface ReminderSyncState {
  phase: ReminderSyncPhase;
  /** Последний подтверждённый снимок; `null` до первого чтения. */
  snapshot: ReminderSyncSnapshot | null;
  online: boolean;
  /** Чтение (первое или после неясного исхода) не удалось; пока не нажали
   * «ещё раз», новое не уходит — повторов по таймеру нет. */
  readError: string | null;
  refusal: ReminderRefusal | null;
}

export type ReminderSyncEvent =
  | { type: 'connection'; online: boolean }
  | { type: 'saveStarted' }
  | { type: 'saveSucceeded'; body: unknown; accountId: string }
  | { type: 'saveFailed'; error: unknown; kind: ReminderChangeKind }
  | { type: 'readSucceeded'; body: unknown; accountId: string }
  | { type: 'readFailed'; error: unknown }
  | { type: 'readRetried' };

/** Статус над контролами, когда редактирование стоит. */
export type ReminderSyncNotice =
  'offline' | 'checking' | 'waitingForNetwork' | 'checkFailed';

export const REMINDER_SYNC_NOTICE_TEXT: Record<ReminderSyncNotice, string> = {
  offline: 'Нет сети. Настройки напоминаний можно менять, когда она появится.',
  checking: 'Не знаем, сохранилось ли, — проверяем…',
  waitingForNetwork: 'Не знаем, сохранилось ли. Проверим, когда появится сеть.',
  checkFailed: 'Не удалось проверить, сохранилось ли. Менять настройки пока нельзя.',
};

export const REMINDER_SYNC_LOAD_ERROR =
  'Не удалось загрузить занятия. Попробуйте ещё раз.';

const UNAUTHORIZED_STATUS = 401;
// Ответ с этими статусами значит «записи не было» (контракт, таблица отказов).
const REFUSAL_STATUSES: readonly number[] = [400, 403, 409, 413, 415];
const REVISION_PATTERN = /^(0|[1-9][0-9]*)$/;

export function initialReminderSyncState(online: boolean): ReminderSyncState {
  return { phase: 'loading', snapshot: null, online, readError: null, refusal: null };
}

/** Можно ли начать сохранение: одно за раз, только онлайн, только поверх
 * подтверждённого снимка. */
export function canSave(state: ReminderSyncState): boolean {
  return state.phase === 'idle' && state.online && state.snapshot !== null;
}

/** Нужно ли сейчас читать снимок. Первое чтение идёт и без сети — оно покажет
 * сбой с кнопкой; чтение после неясного исхода ждёт сети. */
export function needsRead(state: ReminderSyncState): boolean {
  if (state.readError !== null) return false;
  if (state.phase === 'loading') return true;
  return state.phase === 'verifying' && state.online;
}

export function reminderSyncNotice(state: ReminderSyncState): ReminderSyncNotice | null {
  if (state.phase === 'verifying') {
    if (state.readError !== null) return 'checkFailed';
    return state.online ? 'checking' : 'waitingForNetwork';
  }
  return state.online || state.phase === 'loading' ? null : 'offline';
}

type WriteFailure =
  { kind: 'refused'; message: string } | { kind: 'unauthorized' } | { kind: 'uncertain' };

/** Исход записи по ошибке. Всё, что не отказ и не 401, — неясно: сеть, таймаут,
 * 5xx, 429, незнакомый статус и ответ 2xx, который не разобрался как JSON (его
 * бросает apiFetch не `ApiError`). Сервер мог принять запись, поэтому «не
 * удалось» говорить нельзя. */
export function classifyWriteFailure(error: unknown): WriteFailure {
  if (error instanceof ApiError) {
    if (error.status === UNAUTHORIZED_STATUS) return { kind: 'unauthorized' };
    if (REFUSAL_STATUSES.includes(error.status)) {
      return { kind: 'refused', message: error.message };
    }
  }
  return { kind: 'uncertain' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

// Без повторов и по возрастанию кодовых единиц — так сервер отдаёт множества;
// иной порядок значит ответ не по контракту, а не «разные вкусы».
function isCanonicalIds(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  let previous: string | null = null;
  for (const id of value) {
    if (typeof id !== 'string' || (previous !== null && previous >= id)) return false;
    previous = id;
  }
  return true;
}

function isSlot(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isInteger(value.weekday) &&
    typeof value.time === 'string' &&
    Number.isInteger(value.durationMin)
  );
}

function isCatalogueClass(value: unknown): value is LessonScopeClassDto {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.groupLabel === 'string' &&
    typeof value.tz === 'string' &&
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

/** Снимок из тела ответа или `null`: поля и типы по контракту, лишние поля
 * отбрасываются, пустой выбор остаётся пустым, а не «ошибкой». */
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
  if (!isLeadMinutes(leadMinutes) || !isPositiveInteger(schoolMinutes)) return null;
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

/** Снимок, которому можно верить поверх подтверждённого, или `null`. */
function acceptSnapshot(
  confirmed: ReminderSyncSnapshot | null,
  body: unknown,
  accountId: string,
): ReminderSyncSnapshot | null {
  const incoming = parseReminderSnapshot(body);
  if (incoming === null || incoming.accountId !== accountId) return null;
  if (confirmed && BigInt(incoming.revision) < BigInt(confirmed.revision)) return null;
  return incoming;
}

function awaitingRead(state: ReminderSyncState): boolean {
  return state.phase === 'loading' || state.phase === 'verifying';
}

function readErrorFor(state: ReminderSyncState, error: unknown): string {
  if (state.phase === 'verifying') return REMINDER_SYNC_NOTICE_TEXT.checkFailed;
  return error instanceof ApiError ? error.message : REMINDER_SYNC_LOAD_ERROR;
}

function toVerifying(state: ReminderSyncState): ReminderSyncState {
  return { ...state, phase: 'verifying', readError: null, refusal: null };
}

function applySave(
  state: ReminderSyncState,
  event: ReminderSyncEvent,
): ReminderSyncState {
  if (state.phase !== 'saving') return state;
  if (event.type === 'saveSucceeded') {
    const snapshot = acceptSnapshot(state.snapshot, event.body, event.accountId);
    if (snapshot === null) return toVerifying(state);
    return { ...state, phase: 'idle', snapshot, refusal: null };
  }
  if (event.type !== 'saveFailed') return state;
  const failure = classifyWriteFailure(event.error);
  if (failure.kind === 'uncertain') return toVerifying(state);
  if (failure.kind === 'unauthorized') return { ...state, phase: 'idle' };
  return {
    ...state,
    phase: 'idle',
    refusal: { kind: event.kind, message: failure.message },
  };
}

function applyRead(
  state: ReminderSyncState,
  event: ReminderSyncEvent,
): ReminderSyncState {
  if (!awaitingRead(state)) return state;
  if (event.type === 'readFailed') {
    return { ...state, readError: readErrorFor(state, event.error) };
  }
  if (event.type !== 'readSucceeded') return state;
  const snapshot = acceptSnapshot(state.snapshot, event.body, event.accountId);
  if (snapshot === null) return { ...state, readError: readErrorFor(state, null) };
  return { ...state, phase: 'idle', snapshot, readError: null, refusal: null };
}

export function reminderSyncReducer(
  state: ReminderSyncState,
  event: ReminderSyncEvent,
): ReminderSyncState {
  switch (event.type) {
    case 'connection':
      return state.online === event.online ? state : { ...state, online: event.online };
    case 'saveStarted':
      return canSave(state) ? { ...state, phase: 'saving', refusal: null } : state;
    case 'saveSucceeded':
    case 'saveFailed':
      return applySave(state, event);
    case 'readSucceeded':
    case 'readFailed':
      return applyRead(state, event);
    case 'readRetried':
      return state.readError === null ? state : { ...state, readError: null };
  }
}
