// Данные экрана «Настройки уведомлений» про занятия (ADR-0162): выбор человека,
// список занятий школы и личное «за сколько напомнить» — одним `GET`. Хук зовёт
// сам экран один раз и раздаёт результат блокам: «О каких занятиях»
// (LessonScopeSection.tsx) и полю «За сколько напомнить» под переключателем
// «Занятие скоро» (LessonReminderField.tsx). Второй `GET` за тем же ресурсом
// читал бы его дважды и мог разойтись с первым.
// Запись — `PUT`, и каждый `PUT` отдаёт то же, что `GET` (MyLessonNotificationsDto),
// поэтому ответ кладётся на экран напрямую (`applyData`), а не перечитывается
// вторым запросом (ADR-0087, check-write-then-reload). Из ответа берётся только
// своя часть: выбор занятий пишет `scope` и `classes`, «за сколько» — `reminder`.
// Если оба `PUT` в пути, ответ раньше уехавшего принёс бы чужую часть в
// состоянии «до» и затёр бы свежую. Оптимистичной отрисовки нет: контрол
// остаётся в прежнем положении, пока не пришёл ответ, тем же приёмом, что
// useNotificationPrefs.ts.
import { useCallback, useState } from 'react';
import {
  defaultNotifications,
  hasLessonScopedKinds,
  type LessonReminderDto,
  type LessonScope,
  type LessonScopeClassDto,
  type MeDto,
  type MyLessonNotificationsDto,
} from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { ApiError } from '../api/http';
import { useAuth } from '../auth/AuthProvider';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить занятия. Попробуйте ещё раз.';
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить. Попробуйте ещё раз.';

/** Есть ли человеку что настраивать про занятия: хоть один вид уведомления
 * про занятие (`hasLessonScopedKinds`). Сегодня это ученик; штат получает обо
 * всех занятиях, решение владельца 2026-09-30. Одно правило для блока «О каких
 * занятиях», поля «За сколько напомнить» и запроса за их данными: человеку без
 * видов про занятие запрос не нужен, сервер отдал бы список впустую. */
export function hasLessonSettings(me: MeDto | null): boolean {
  return me !== null && hasLessonScopedKinds(defaultNotifications(me.roles));
}

export interface UseLessonScopeResult {
  scope: LessonScope | null;
  classes: LessonScopeClassDto[];
  /** Личное «за сколько напомнить» и школьное значение; `null`, пока данных нет. */
  reminder: LessonReminderDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Идёт запись — контролы блока на это время выключены. */
  saving: boolean;
  saveError: string | null;
  save: (next: LessonScope) => Promise<void>;
  /** Принять ответ `PUT …/reminder-minutes` (его пишет LessonReminderField). */
  applyReminder: (saved: MyLessonNotificationsDto) => void;
}

export function useLessonScope(): UseLessonScopeResult {
  const { me } = useAuth();
  const isRelevant = hasLessonSettings(me);
  const { data, loading, error, reload, applyData } = useAbortableFetch(
    (signal) => apiRoute('GET /me/notifications/lessons', { signal }),
    LOAD_ERROR_MESSAGE,
    { enabled: isRelevant },
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useCallback(
    async (next: LessonScope) => {
      setSaveError(null);
      setSaving(true);
      try {
        const saved = await apiRoute('PUT /me/notifications/lessons/scope', {
          body: next,
        });
        applyData((prev) =>
          prev ? { ...prev, scope: saved.scope, classes: saved.classes } : saved,
        );
      } catch (err) {
        // Текст ответа (например «Такого занятия больше нет в расписании…»)
        // уже написан для человека — показываем его, а не общую фразу.
        setSaveError(err instanceof ApiError ? err.message : SAVE_ERROR_MESSAGE);
      } finally {
        setSaving(false);
      }
    },
    [applyData],
  );

  const applyReminder = useCallback(
    (saved: MyLessonNotificationsDto) =>
      applyData((prev) => (prev ? { ...prev, reminder: saved.reminder } : saved)),
    [applyData],
  );

  return {
    scope: data?.scope ?? null,
    classes: data?.classes ?? [],
    reminder: data?.reminder ?? null,
    // Данных ещё нет и ошибки нет — запрос вот-вот уйдёт (`me` только что
    // пришёл) или уже в пути: это загрузка, а не пустой ответ. Без этого на
    // один кадр между приходом `me` и стартом запроса блок рисовал заголовок
    // без содержимого.
    loading: loading || (isRelevant && data === null && error === null),
    error,
    reload,
    saving,
    saveError,
    save,
    applyReminder,
  };
}
