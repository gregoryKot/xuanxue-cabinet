// Данные страницы занятия расписания — `/schedule/new` и
// `/schedule/:classId` (страница со своим адресом вместо листа поверх сетки,
// ADR-0033). Механика общая с редактором вопроса (hooks/useEntityEditor.ts),
// здесь только коллекция и текст ошибки на языке домена.
import { CLASSES_PATH } from '../api/apiPaths';
import { useEntityEditor, type EntityEditorOf } from '../hooks/useEntityEditor';

const LOAD_ERROR_MESSAGE = 'Не удалось открыть занятие. Попробуйте ещё раз.';

export type UseClassEditorResult = EntityEditorOf<typeof CLASSES_PATH>;

export function useClassEditor(classId: string | undefined): UseClassEditorResult {
  return useEntityEditor(CLASSES_PATH, classId, LOAD_ERROR_MESSAGE);
}
