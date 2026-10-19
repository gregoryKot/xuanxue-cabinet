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
//                   остальное, включая 429 → verifying; если сервер назвал
//                   `Retry-After`, ещё и пауза (`retryHoldSec`)
//   readSucceeded   loading|verifying → idle с ответом; не снимок или отсечён —
//                   сбой чтения
//   readFailed      loading|verifying: сбой чтения, ждём «ещё раз»; с
//                   `Retry-After` — ещё и пауза
//   readRetried     снимает сбой чтения, чтение уходит заново; пока пауза —
//                   ничего
//   retryHoldElapsed  время паузы вышло (его считает хук, редьюсер времени не
//                   знает): пауза снимается
//   connection      онлайн/офлайн; чтение после неясного исхода ждёт сети
//
// Пауза: сервер попросил подождать (`Retry-After` у 429, 503), и ни чтение, ни
// «ещё раз», ни сохранение до конца паузы не уходят — иначе мы сами били бы в
// тот лимит, о котором нас предупредили. Ответ с паузой не пропадает: исход
// записи остаётся неясным, и после паузы идёт обычное одно чтение.
//
// Запись не повторяется нигде: у неясного исхода единственный выход — чтение.
// Ограждение: снимок чужого аккаунта и снимок с ревизией ниже подтверждённой
// игнорируются; равная ревизия принимается — каталог и школьное значение живут
// отдельно от ревизии выбора. Что считается снимком — reminderSnapshot.ts.
import type { ReminderChange, ReminderSyncSnapshot } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { parseReminderSnapshot } from './reminderSnapshot';

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
  /** Сколько секунд сервер просил не обращаться (`Retry-After`); `null` — нет
   * просьбы. Снимает `retryHoldElapsed`, когда хук отсчитал это время. */
  retryHoldSec: number | null;
}

export type ReminderSyncEvent =
  | { type: 'connection'; online: boolean }
  | { type: 'saveStarted' }
  | { type: 'saveSucceeded'; body: unknown; accountId: string }
  | { type: 'saveFailed'; error: unknown; kind: ReminderChangeKind }
  | { type: 'readSucceeded'; body: unknown; accountId: string }
  | { type: 'readFailed'; error: unknown }
  | { type: 'readRetried' }
  | { type: 'retryHoldElapsed' };

/** Статус над контролами, когда редактирование стоит. */
export type ReminderSyncNotice =
  'offline' | 'checking' | 'waitingForNetwork' | 'retryHold' | 'checkFailed';

export const REMINDER_SYNC_NOTICE_TEXT: Record<ReminderSyncNotice, string> = {
  offline: 'Нет сети. Настройки напоминаний можно менять, когда она появится.',
  checking: 'Не знаем, сохранилось ли, — проверяем…',
  waitingForNetwork: 'Не знаем, сохранилось ли. Проверим, когда появится сеть.',
  retryHold: 'Не знаем, сохранилось ли. Проверим чуть позже — сервер попросил подождать.',
  checkFailed: 'Не удалось проверить, сохранилось ли. Менять настройки пока нельзя.',
};

export const REMINDER_SYNC_LOAD_ERROR =
  'Не удалось загрузить занятия. Попробуйте ещё раз.';

const UNAUTHORIZED_STATUS = 401;
// Ответ с этими статусами значит «записи не было» (контракт, таблица отказов).
const REFUSAL_STATUSES: readonly number[] = [400, 403, 409, 413, 415];
// Потолок паузы: `setTimeout` с задержкой больше ~24 суток срабатывает сразу, а
// пауза в часы закрыла бы настройки на весь вечер. Час — с запасом больше любого
// разумного `Retry-After` от лимитера.
const RETRY_HOLD_MAX_SEC = 3600;

export function initialReminderSyncState(online: boolean): ReminderSyncState {
  return {
    phase: 'loading',
    snapshot: null,
    online,
    readError: null,
    refusal: null,
    retryHoldSec: null,
  };
}

/** Пауза по ошибке: секунды из `Retry-After`, если сервер их назвал и они больше
 * нуля; иначе `null` — поведение прежнее. */
function retryHoldFor(error: unknown): number | null {
  if (!(error instanceof ApiError)) return null;
  const seconds = error.retryAfterSec;
  if (seconds === undefined || !(seconds > 0)) return null;
  return Math.min(seconds, RETRY_HOLD_MAX_SEC);
}

/** Можно ли начать сохранение: одно за раз, только онлайн, только поверх
 * подтверждённого снимка. */
export function canSave(state: ReminderSyncState): boolean {
  return state.phase === 'idle' && state.online && state.snapshot !== null;
}

/** Нужно ли сейчас читать снимок. Первое чтение идёт и без сети — оно покажет
 * сбой с кнопкой; чтение после неясного исхода ждёт сети. */
export function needsRead(state: ReminderSyncState): boolean {
  if (state.readError !== null || state.retryHoldSec !== null) return false;
  if (state.phase === 'loading') return true;
  return state.phase === 'verifying' && state.online;
}

export function reminderSyncNotice(state: ReminderSyncState): ReminderSyncNotice | null {
  if (state.phase === 'verifying') {
    if (state.readError !== null) return 'checkFailed';
    if (state.retryHoldSec !== null) return 'retryHold';
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

function toVerifying(
  state: ReminderSyncState,
  retryHoldSec: number | null = null,
): ReminderSyncState {
  return { ...state, phase: 'verifying', readError: null, refusal: null, retryHoldSec };
}

type EventOf<T> = Extract<ReminderSyncEvent, { type: T }>;

function applySave(
  state: ReminderSyncState,
  event: EventOf<'saveSucceeded' | 'saveFailed'>,
): ReminderSyncState {
  if (state.phase !== 'saving') return state;
  if (event.type === 'saveSucceeded') {
    const snapshot = acceptSnapshot(state.snapshot, event.body, event.accountId);
    if (snapshot === null) return toVerifying(state);
    return { ...state, phase: 'idle', snapshot, refusal: null };
  }
  const failure = classifyWriteFailure(event.error);
  if (failure.kind === 'uncertain') return toVerifying(state, retryHoldFor(event.error));
  if (failure.kind === 'unauthorized') return { ...state, phase: 'idle' };
  const refusal = { kind: event.kind, message: failure.message };
  return { ...state, phase: 'idle', refusal };
}

function applyRead(
  state: ReminderSyncState,
  event: EventOf<'readSucceeded' | 'readFailed'>,
): ReminderSyncState {
  if (!awaitingRead(state)) return state;
  if (event.type === 'readFailed') {
    const readError = readErrorFor(state, event.error);
    return { ...state, readError, retryHoldSec: retryHoldFor(event.error) };
  }
  const snapshot = acceptSnapshot(state.snapshot, event.body, event.accountId);
  if (snapshot === null) return { ...state, readError: readErrorFor(state, null) };
  return {
    ...state,
    phase: 'idle',
    snapshot,
    readError: null,
    refusal: null,
    retryHoldSec: null,
  };
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
      return state.readError === null || state.retryHoldSec !== null
        ? state
        : { ...state, readError: null };
    case 'retryHoldElapsed':
      return state.retryHoldSec === null ? state : { ...state, retryHoldSec: null };
  }
}
