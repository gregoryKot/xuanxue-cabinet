// Фильтр «о каких занятиях» для подсказки в ленте (LessonScopeHint.tsx, ADR-0162,
// п. 5): выбор человека `scope`, признак «выбирал ли сам» и список занятий
// школы — одним `GET /me/notifications/lessons`. Запись — `PUT`, и каждый `PUT`
// отдаёт то же, что `GET` (MyLessonNotificationsDto), поэтому ответ кладётся на
// экран напрямую (`applyData`), а не перечитывается вторым запросом (ADR-0087,
// check-write-then-reload). Оптимистичной отрисовки нет: контрол остаётся в
// прежнем положении, пока не пришёл ответ.
// Экран настроек этот хук не зовёт: напоминания там читает и пишет
// useReminderSync.ts. Здесь же живёт `hasLessonSettings` — одно правило «есть ли
// человеку что настраивать про занятия» для подсказки, блоков настроек и запросов.
import { useCallback, useState } from 'react';
import {
  availableNotifications,
  hasLessonScopedKinds,
  type LessonScope,
  type LessonScopeClassDto,
  type MeDto,
} from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { ApiError } from '../api/http';
import { useAuth } from '../auth/AuthProvider';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить занятия. Попробуйте ещё раз.';
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить. Попробуйте ещё раз.';

/** Есть ли человеку что настраивать про занятия: хоть один вид уведомления
 * про занятие (`hasLessonScopedKinds`). Сегодня это ученик; штат получает
 * обо всех занятиях, решение владельца 2026-09-30. Человеку без видов про
 * занятие запрос не нужен, сервер отдал бы список впустую. */
export function hasLessonSettings(me: MeDto | null): boolean {
  return me !== null && hasLessonScopedKinds(availableNotifications(me.roles));
}

export interface UseLessonScopeResult {
  scope: LessonScope | null;
  /** Выбирал ли человек сам (в том числе «все»); `null`, пока данных нет. По
   * нему лента решает, звать ли выбрать свои занятия (LessonScopeHint.tsx). */
  scopeChosen: boolean | null;
  classes: LessonScopeClassDto[];
  /** Идёт запись — контролы подсказки на это время выключены. */
  saving: boolean;
  saveError: string | null;
  save: (next: LessonScope) => Promise<void>;
}

export function useLessonScope(): UseLessonScopeResult {
  const { me } = useAuth();
  const { data, applyData } = useAbortableFetch(
    (signal) => apiRoute('GET /me/notifications/lessons', { signal }),
    LOAD_ERROR_MESSAGE,
    { enabled: hasLessonSettings(me) },
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
        applyData(saved);
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

  return {
    scope: data?.scope ?? null,
    scopeChosen: data?.scopeChosen ?? null,
    classes: data?.classes ?? [],
    saving,
    saveError,
    save,
  };
}
