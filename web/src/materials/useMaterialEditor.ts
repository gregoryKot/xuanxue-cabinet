// Данные страницы материала — `/materials/new` и `/materials/:materialId`
// (страница со своим адресом вместо листа поверх списка, ADR-0033). Механика
// общая с редактором канала, экзамена и вопроса (hooks/useEntityEditor.ts),
// здесь только путь коллекции и текст ошибки на языке домена.
//
// Четвёртый параметр `useEntityEditor` — `MaterialDto`, не оставлен по
// умолчанию (`void`): материал единственный, кому после «Сохранить» нужна
// сама созданная запись, а не переход на список (ADR-0134) — по её id
// useNewMaterialFile.ts отправляет следом файл. Остальные домены
// (useChannelEditor.ts, useExamEditor.ts и т.д.) этот параметр не трогают —
// у них create() как был `Promise<void>`, так и остался.
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
  UpdateMaterialInput,
  MaterialDto
>;

export function useMaterialEditor(
  materialId: string | undefined,
): UseMaterialEditorResult {
  return useEntityEditor<
    MaterialDto,
    CreateMaterialInput,
    UpdateMaterialInput,
    MaterialDto
  >(MATERIALS_PATH, materialId, LOAD_ERROR_MESSAGE);
}
