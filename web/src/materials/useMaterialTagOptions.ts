// Подсказка «что уже есть в школе» — общий источник для даталиста формы
// материала (MaterialFormFields.tsx) и пилюль фильтра «Библиотеки»
// (MaterialsScreen.tsx): без справочника тегов (ADR-0058) написания иначе
// разъедутся, «старшая» и «Старшая» станут разными пилюлями.
//
// Список не зависит от фильтра экрана — запрос всегда без `kind`/`tag`
// (materialsListPath('', '')): если бы пилюли собирались из уже
// отфильтрованного ответа, выбор одной пилюли сразу же убирал бы соседние
// из-под пальца.
//
// Сбой этого запроса не должен мешать ни форме, ни списку — здесь нет
// LoadErrorBanner, ошибку просто не показываем: не появится подсказок, но
// сохранить материал или посмотреть библиотеку можно и без них.
import { useMemo } from 'react';
import type { MaterialDto } from '@xuanxue/shared';
import { materialsListPath } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { collectUniqueTags } from '../lib/collectUniqueTags';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить список тегов.';

export function useMaterialTagOptions(): string[] {
  const { data } = useAbortableFetch<MaterialDto[]>(
    (signal) => apiFetch<MaterialDto[]>(materialsListPath('', ''), { signal }),
    LOAD_ERROR_MESSAGE,
  );
  // Array.isArray — на случай ответа не той формы (сбой сети сам по себе уже
  // ловится useAbortableFetch как error, здесь достаточно не уронить рендер).
  return useMemo(() => collectUniqueTags(Array.isArray(data) ? data : []), [data]);
}
