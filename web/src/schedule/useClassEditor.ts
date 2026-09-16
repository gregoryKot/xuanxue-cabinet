// Данные страницы занятия расписания — `/schedule/new` и
// `/schedule/:classId` (страница со своим адресом вместо листа поверх сетки,
// ADR-0033). Механика общая с редактором вопроса (hooks/useEntityEditor.ts),
// здесь только путь коллекции и текст ошибки на языке домена.
import type { ClassDto, CreateClassInput, UpdateClassInput } from '@xuanxue/shared';
import { useEntityEditor, type UseEntityEditorResult } from '../hooks/useEntityEditor';

const CLASSES_PATH = '/classes';
const LOAD_ERROR_MESSAGE = 'Не удалось открыть занятие. Попробуйте ещё раз.';

export type UseClassEditorResult = UseEntityEditorResult<
  ClassDto,
  CreateClassInput,
  UpdateClassInput
>;

export function useClassEditor(classId: string | undefined): UseClassEditorResult {
  return useEntityEditor(CLASSES_PATH, classId, LOAD_ERROR_MESSAGE);
}
