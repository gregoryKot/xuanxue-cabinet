// Данные страницы материала — `/materials/new` и `/materials/:materialId`
// (страница со своим адресом вместо листа поверх списка, ADR-0033). Механика
// общая с редактором канала, экзамена и вопроса (hooks/useEntityEditor.ts),
// здесь только путь коллекции и текст ошибки на языке домена.
import type {
  CreateMaterialInput,
  MaterialDto,
  UpdateMaterialInput,
} from '@xuanxue/shared';
import { MATERIALS_PATH } from '../api/apiPaths';
import { useEntityEditor, type UseEntityEditorResult } from '../hooks/useEntityEditor';

const LOAD_ERROR_MESSAGE = 'Не удалось открыть материал. Попробуйте ещё раз.';

export type UseMaterialEditorResult = UseEntityEditorResult<
  MaterialDto,
  CreateMaterialInput,
  UpdateMaterialInput
>;

export function useMaterialEditor(
  materialId: string | undefined,
): UseMaterialEditorResult {
  return useEntityEditor(MATERIALS_PATH, materialId, LOAD_ERROR_MESSAGE);
}
