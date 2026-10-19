// Настройки напоминаний на экране «Настройки уведомлений» (контракт
// reminder-sync, ADR-0185): снимок читается одним `GET` и раздаётся блокам
// «О каких занятиях» (LessonScopeSection.tsx) и «За сколько напомнить»
// (LessonReminderField.tsx) — экран зовёт хук один раз. Все решения — в
// reminderSyncState.ts; здесь только эффекты: сеть, события online/offline,
// отмена при размонтировании.
//
// `PATCH` один на весь экран, не повторяется и не копится: пока он в пути,
// охранный флаг не пускает второй (контролы к этому моменту уже выключены).
// Ответ записи — подтверждённый снимок, второго `GET` за ним нет (ADR-0087).
// `GET` после записи уходит только при неясном исходе: сервер мог принять
// запись, и единственный честный ответ на это — прочитать, а не отправить
// снова. Если сервер просил подождать (`Retry-After`), чтение уходит после
// паузы, которую отсчитывает таймер хука. Ответ, пришедший после
// размонтирования, отбрасывается.
import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  REMINDER_SYNC_VERSION,
  type ReminderChange,
  type ReminderSyncSnapshot,
} from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { useAuth } from '../auth/AuthProvider';
import { hasLessonSettings } from './lessonReminderVisibility';
import {
  canSave,
  initialReminderSyncState,
  needsRead,
  reminderSyncNotice,
  reminderSyncReducer,
  type ReminderRefusal,
  type ReminderSyncNotice,
} from './reminderSyncState';

const MS_PER_SECOND = 1000;

export interface UseReminderSyncResult {
  /** Подтверждённый снимок; `null`, пока его нет. */
  snapshot: ReminderSyncSnapshot | null;
  /** Первое чтение идёт — блоки рисуют скелетон. */
  loading: boolean;
  /** Первое чтение не удалось; текст — для баннера с повтором. */
  loadError: string | null;
  /** Контролы выключены: идёт запись, нет сети или исход прошлой записи
   * проверяется. */
  controlsDisabled: boolean;
  notice: ReminderSyncNotice | null;
  /** Отказ сервера на последнее сохранение. */
  refusal: ReminderRefusal | null;
  /** Одно изменение; в очередь не встаёт, если сохранять сейчас нельзя. */
  save: (change: ReminderChange) => void;
  /** «Ещё раз» после сбоя чтения — первого или проверки исхода записи. */
  retryRead: () => void;
}

function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

export function useReminderSync(): UseReminderSyncResult {
  const { me } = useAuth();
  const accountId = me?.id ?? null;
  const isRelevant = hasLessonSettings(me);
  const [state, dispatch] = useReducer(reminderSyncReducer, undefined, () =>
    initialReminderSyncState(isBrowserOnline()),
  );
  const isSaveInFlight = useRef(false);
  const saveAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const report = () => dispatch({ type: 'connection', online: navigator.onLine });
    // Сеть могла пропасть между первым рендером и подпиской.
    report();
    window.addEventListener('online', report);
    window.addEventListener('offline', report);
    return () => {
      window.removeEventListener('online', report);
      window.removeEventListener('offline', report);
    };
  }, []);

  useEffect(() => () => saveAbort.current?.abort(), []);

  // Пауза по `Retry-After`: автомат времени не знает, он только держит ничего не
  // отправлять, пока хук не скажет, что срок вышел. Смена паузы или уход экрана
  // гасит таймер — запоздавшее «срок вышел» снимало бы чужую, новую паузу.
  const retryHoldSec = state.retryHoldSec;
  useEffect(() => {
    if (retryHoldSec === null) return;
    const timer = setTimeout(
      () => dispatch({ type: 'retryHoldElapsed' }),
      retryHoldSec * MS_PER_SECOND,
    );
    return () => clearTimeout(timer);
  }, [retryHoldSec]);

  const isReading = isRelevant && accountId !== null && needsRead(state);
  useEffect(() => {
    if (!isReading || accountId === null) return;
    const controller = new AbortController();
    const read = async () => {
      try {
        const body = await apiRoute('GET /me/notifications/lessons/sync', {
          signal: controller.signal,
        });
        if (!controller.signal.aborted)
          dispatch({ type: 'readSucceeded', body, accountId });
      } catch (error) {
        if (!controller.signal.aborted) dispatch({ type: 'readFailed', error });
      }
    };
    void read();
    return () => controller.abort();
  }, [isReading, accountId]);

  const isEditable = canSave(state);
  const save = useCallback(
    (change: ReminderChange) => {
      if (!isEditable || accountId === null || isSaveInFlight.current) return;
      isSaveInFlight.current = true;
      dispatch({ type: 'saveStarted' });
      const controller = new AbortController();
      saveAbort.current = controller;
      const write = async () => {
        try {
          const body = await apiRoute('PATCH /me/notifications/lessons/sync', {
            body: { version: REMINDER_SYNC_VERSION, changes: [change] },
            signal: controller.signal,
          });
          if (!controller.signal.aborted) {
            dispatch({ type: 'saveSucceeded', body, accountId });
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            dispatch({ type: 'saveFailed', error, kind: change.kind });
          }
        } finally {
          isSaveInFlight.current = false;
        }
      };
      void write();
    },
    [isEditable, accountId],
  );

  const retryRead = useCallback(() => dispatch({ type: 'readRetried' }), []);

  return {
    snapshot: state.snapshot,
    loading: isRelevant && state.phase === 'loading' && state.readError === null,
    loadError: state.phase === 'loading' ? state.readError : null,
    controlsDisabled: !isEditable,
    notice: reminderSyncNotice(state),
    refusal: state.refusal,
    save,
    retryRead,
  };
}
