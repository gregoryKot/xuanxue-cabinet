// Подсказка «что уже есть в школе» — общий источник тегов для всех пяти мест
// ввода (материал, дата занятия, занятие расписания, канал, вопрос экзамена,
// CLAUDE.md «Одна механика — один компонент») и пилюль фильтра «Материалов»
// (MaterialsScreen.tsx). Раньше подсказка была только у формы материала и
// ради неё тянулся весь список материалов — теперь общая сводка школы
// (GET /api/tags, ADR-0075) отдаёт готовый список сразу, уже
// отсортированный сервером по использованности.
//
// Сбой этого запроса не должен мешать ни форме, ни списку — здесь нет
// LoadErrorBanner, ошибку просто не показываем: не появится подсказок, но
// сохранить запись или посмотреть библиотеку можно и без них.
import { useMemo } from 'react';
import type { TagSummaryDto } from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { TAGS_LIST_PATH } from '../api/tagsApiPaths';
import { useAbortableFetch } from './useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить список тегов.';

export interface UseTagOptionsFilter {
  /** Только теги, у которых есть хотя бы один материал — нужно пилюлям
   * фильтра «Материалов»: выбор тега без материалов дал бы пустую
   * библиотеку. По умолчанию `false` — формам ввода нужны все теги школы. */
  withMaterialsOnly?: boolean;
}

export function useTagOptions(filter: UseTagOptionsFilter = {}): string[] {
  const { withMaterialsOnly = false } = filter;
  const { data } = useAbortableFetch<TagSummaryDto[]>(
    (signal) => apiFetch<TagSummaryDto[]>(TAGS_LIST_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );

  return useMemo(() => {
    const summaries = Array.isArray(data) ? data : [];
    const withTags = withMaterialsOnly
      ? summaries.filter((summary) => summary.materialCount > 0)
      : summaries;
    return withTags.map((summary) => summary.tag);
  }, [data, withMaterialsOnly]);
}
