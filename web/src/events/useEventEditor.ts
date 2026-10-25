// Данные страницы события — `/events/new` и `/events/:eventId` (ADR-0177).
// Общий useEntityEditor (hooks/useEntityEditor.ts) здесь не подходит: он
// читает запись своим `GET /коллекция/:id`, а у событий одиночного GET нет —
// штату хватает списка, событий в школе единицы. Поэтому запись берётся из
// `GET /events` по id (тот же запрос, что у доски штата, и тот же путь для
// предзагрузки — SCHOOL_EVENTS_PATH). Список отдаёт самые поздние события
// первыми, так что предстоящие всегда в нём: на правку ведут с доски, а она
// показывает только предстоящие. Старое событие за пределами лимита по
// адресу не откроется — такого события на доске нет, а прошлогодний ретрит
// править незачем.
// Нет события в ответе — его удалили, пока страница была открыта в другой
// вкладке: понятный текст и «Обновить», а не пустая форма.
//
// create/update/remove ходят по карте маршрутов; свежее состояние доска берёт
// сама при монтировании (ADR-0087), перечитывать после записи не нужно.
import { useCallback } from 'react';
import type {
  CreateSchoolEventInput,
  SchoolEventDto,
  UpdateSchoolEventInput,
} from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось открыть событие. Попробуйте ещё раз.';
const MISSING_MESSAGE = 'Это событие уже удалено. Вернитесь на главную.';

export interface UseEventEditorResult {
  /** `null` — новое событие, его ещё нет на сервере. */
  entity: SchoolEventDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (input: CreateSchoolEventInput) => Promise<SchoolEventDto>;
  update: (id: string, input: UpdateSchoolEventInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useEventEditor(eventId: string | undefined): UseEventEditorResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiRoute('GET /events', { signal }),
    LOAD_ERROR_MESSAGE,
    { enabled: eventId !== undefined },
  );

  const entity = data?.find((event) => event.id === eventId) ?? null;
  const isMissing = eventId !== undefined && data !== null && entity === null;

  const create = useCallback(
    (input: CreateSchoolEventInput) => apiRoute('POST /events', { body: input }),
    [],
  );
  const update = useCallback(async (id: string, input: UpdateSchoolEventInput) => {
    await apiRoute('PATCH /events/:id', { params: { id }, body: input });
  }, []);
  const remove = useCallback(async (id: string) => {
    await apiRoute('DELETE /events/:id', { params: { id } });
  }, []);

  return {
    entity,
    loading,
    error: error ?? (isMissing ? MISSING_MESSAGE : null),
    reload,
    create,
    update,
    remove,
  };
}
