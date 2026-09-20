// Материалы одной даты занятия (ADR-0056): чтение `GET /materials?lessonId=`
// и две правки привязки — «Из библиотеки» и «Убрать». Обе идут одним
// `PATCH /materials/:id` с полным списком `lessonIds`, каким он должен стать
// (сервер принимает список целиком, UpdateMaterialDto), и после ответа
// список перечитывается: показываем то, что действительно сохранилось
// (CLAUDE.md «Read-after-write»).
//
// Создание ссылки на месте живёт отдельно (useNewLessonMaterialForm.ts) —
// у формы своё состояние и свои ошибки под полями.
import { useCallback, useState } from 'react';
import { LIST_LIMIT_MAX, type MaterialDto } from '@xuanxue/shared';
import { entityPath, MATERIALS_PATH } from '../api/apiPaths';
import { ApiError, apiFetch } from '../api/http';
import { useAbortableFetch } from '../hooks/useAbortableFetch';
import { attachLesson, detachLesson } from './lessonMaterials';

const LOAD_ERROR_MESSAGE = 'Не удалось загрузить материалы занятия. Попробуйте ещё раз.';
const LINK_ERROR_MESSAGE = 'Не удалось изменить список. Попробуйте ещё раз.';

/** Путь живёт здесь, а не в apiPaths.ts: его зовёт только этот хук, первый
 * экран его не предзагружает (apiPaths.ts, шапка файла). */
function lessonMaterialsPath(lessonId: string): string {
  return `${MATERIALS_PATH}?lessonId=${encodeURIComponent(lessonId)}&limit=${LIST_LIMIT_MAX}`;
}

export interface UseLessonMaterialsResult {
  materials: MaterialDto[] | null;
  loading: boolean;
  error: string | null;
  /** Сбой привязки или отвязки — рядом со списком, а не вместо него: список
   * уже загружен и остаётся на экране. */
  linkError: string | null;
  reload: () => Promise<void>;
  attach: (material: MaterialDto) => Promise<void>;
  detach: (material: MaterialDto) => Promise<void>;
}

export function useLessonMaterials(lessonId: string): UseLessonMaterialsResult {
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) => apiFetch<MaterialDto[]>(lessonMaterialsPath(lessonId), { signal }),
    LOAD_ERROR_MESSAGE,
  );
  const [linkError, setLinkError] = useState<string | null>(null);

  const saveLessonIds = useCallback(
    async (material: MaterialDto, lessonIds: string[]) => {
      setLinkError(null);
      try {
        await apiFetch(entityPath(MATERIALS_PATH, material.id), {
          method: 'PATCH',
          body: { lessonIds },
        });
        await reload();
      } catch (err) {
        setLinkError(err instanceof ApiError ? err.message : LINK_ERROR_MESSAGE);
      }
    },
    [reload],
  );

  const attach = useCallback(
    (material: MaterialDto) =>
      saveLessonIds(material, attachLesson(material.lessonIds, lessonId)),
    [saveLessonIds, lessonId],
  );

  const detach = useCallback(
    (material: MaterialDto) =>
      saveLessonIds(material, detachLesson(material.lessonIds, lessonId)),
    [saveLessonIds, lessonId],
  );

  return { materials: data, loading, error, linkError, reload, attach, detach };
}
