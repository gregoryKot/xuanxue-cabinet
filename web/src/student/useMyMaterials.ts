// Данные экрана «Библиотека» ученика — GET /me/materials (docs/PLAN.md §14,
// слой 3.2, ADR-0047, ADR-0048). Read-only, тот же приём, что у
// useMyArchive.ts: лимит не передаём, сервис сам берёт
// MY_MATERIALS_LIMIT_DEFAULT, когда query пуст (ListMyMaterialsDto).
import type { MyMaterialDto } from '@xuanxue/shared';
import { MY_MATERIALS_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import {
  useAbortableFetch,
  type UseAbortableFetchResult,
} from '../hooks/useAbortableFetch';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить библиотеку. Попробуйте ещё раз.';

export function useMyMaterials(): UseAbortableFetchResult<MyMaterialDto[]> {
  return useAbortableFetch(
    (signal) => apiFetch<MyMaterialDto[]>(MY_MATERIALS_PATH, { signal }),
    LOAD_ERROR_MESSAGE,
  );
}
