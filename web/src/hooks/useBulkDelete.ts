// Массовое удаление строк списка (ADR-0141) — состав выбора несёт
// useListSelection.ts, этот хук добавляет сам запрос и разбор частичного
// успеха: `POST /<коллекция>/bulk-delete` удаляет любую запись в любом
// статусе (ADR-0140), но отдельная запись всё ещё может не найтись — её
// удалили с другого устройства, — и обе новости приходят в одном ответе.
//
// Список правится ЛОКАЛЬНО из ответа записи, не вторым `GET` (ADR-0087,
// check-write-then-reload.mjs): `onDeleted` отдаёт удалённые id вызывающему
// экрану, тот применяет `lib/listPatch.ts#withoutIds` к своим данным сам —
// хук ничего не знает о форме списка конкретного домена.
//
// `confirming` открывает/закрывает components/ConfirmDialog.tsx — сам диалог
// закрывается собственным `close()` после `onConfirm` (тот же приём, что у
// hooks/useConfirmedRemove.ts), поэтому `confirmDelete` не трогает
// `confirming` — это исключительно дело requestDelete()/cancelDelete().
import { useState } from 'react';
import type { BulkDeleteResult } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { errorFrom } from '../components/FormServerError';
import { useListSelection, type UseListSelectionResult } from './useListSelection';

// Здесь, а не в api/apiPaths.ts: единственный потребитель, а apiPaths.ts
// уже выше потолка храповика размера и расти не может.
function bulkDeletePath(collectionPath: string): string {
  return `${collectionPath}/bulk-delete`;
}

const FALLBACK_ERROR_MESSAGE =
  'Не удалось удалить. Проверьте связь и попробуйте ещё раз.';

export interface UseBulkDeleteConfig {
  /** Путь коллекции без `/bulk-delete` — `api/apiPaths.ts#EXAM_ITEMS_PATH`/`EXAMS_PATH`. */
  collectionPath: string;
  visibleIds: readonly string[];
  onDeleted: (deletedIds: string[]) => void;
}

export interface UseBulkDeleteResult extends UseListSelectionResult {
  confirming: boolean;
  /** Клик по «Удалить» в баре — открывает подтверждение, запрос ещё не ушёл. */
  requestDelete: () => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
  pending: boolean;
  /** Последний ответ сервера — держим и при пустом `failed`, чтобы бар
   * показал итог («Удалили 5 вопросов») уже после выхода из режима выбора. */
  result: BulkDeleteResult | null;
  error: string | null;
}

export function useBulkDelete(config: UseBulkDeleteConfig): UseBulkDeleteResult {
  const selection = useListSelection(config.visibleIds);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<BulkDeleteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function start(): void {
    setResult(null);
    setError(null);
    selection.start();
  }

  async function confirmDelete(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const response = await apiFetch<BulkDeleteResult>(
        bulkDeletePath(config.collectionPath),
        { method: 'POST', body: { ids: selection.selectedVisibleIds } },
      );
      setResult(response);
      config.onDeleted(response.deletedIds);
      // Отказавшие остаются отмечены — видно, какие именно не удалились;
      // «Готово» снимает отметки и выходит из режима.
      if (response.failed.length === 0) selection.stop();
      else selection.selectOnly(response.failed.map((failure) => failure.id));
    } catch (err) {
      setError(errorFrom(err, FALLBACK_ERROR_MESSAGE).message);
    } finally {
      setPending(false);
    }
  }

  return {
    ...selection,
    start,
    confirming,
    requestDelete: () => setConfirming(true),
    cancelDelete: () => setConfirming(false),
    confirmDelete,
    pending,
    result,
    error,
  };
}
