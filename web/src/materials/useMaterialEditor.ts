// Данные страницы материала — `/materials/new` и `/materials/:materialId`
// (страница со своим адресом вместо листа поверх списка, ADR-0033). Механика
// общая с редактором канала, экзамена и вопроса (hooks/useEntityEditor.ts),
// здесь только коллекция и текст ошибки на языке домена.
//
// Материал единственный, кому после «Сохранить» нужна сама созданная запись,
// а не переход на список (ADR-0134): по её id useNewMaterialFile.ts отправляет
// следом файл. `create()` отдаёт ответ POST из карты маршрутов — `MaterialDto`.
import { MATERIALS_PATH } from '../api/apiPaths';
import { useEntityEditor, type EntityEditorOf } from '../hooks/useEntityEditor';

const LOAD_ERROR_MESSAGE = 'Не удалось открыть материал. Попробуйте ещё раз.';

export type UseMaterialEditorResult = EntityEditorOf<typeof MATERIALS_PATH>;

export function useMaterialEditor(
  materialId: string | undefined,
): UseMaterialEditorResult {
  return useEntityEditor(MATERIALS_PATH, materialId, LOAD_ERROR_MESSAGE);
}
