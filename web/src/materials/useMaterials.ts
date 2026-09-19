// Список материалов библиотеки — чтение с фильтром по виду и по тегу
// (ADR-0058, серверный фильтр `tag=`), по образцу exam-items/useExamItems.ts.
// Правка и создание живут на своей странице со своим хуком
// (useMaterialEditor.ts, ADR-0033) — мутаций здесь нет, список читается
// заново при возврате на экран. Фильтры меняются с экрана, а не
// переоткрытием — перечитываем список при смене любого из двух.
import { useEffect, useRef } from 'react';
import type { MaterialDto, MaterialKind } from '@xuanxue/shared';
import { materialsListPath } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить материалы. Попробуйте ещё раз.';

export interface UseMaterialsResult {
  materials: MaterialDto[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useMaterials(kind: MaterialKind | '', tag: string): UseMaterialsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<MaterialDto[]>(materialsListPath(kind, tag), { signal }),
    LOAD_ERROR_MESSAGE,
  );

  // Первый рендер уже сделал запрос сам (useAbortableFetch) — этот эффект
  // реагирует только на смену любого из двух фильтров после монтирования.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void reload();
  }, [kind, tag, reload]);

  return { materials: data, loading, error, reload };
}
