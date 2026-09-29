// Данные страницы редактора экзамена — `/exams/new` и `/exams/:examId`
// (ADR-0033). Механика общая с редактором вопроса (hooks/useEntityEditor.ts),
// здесь только коллекция и текст ошибки на языке домена.
import { EXAMS_PATH } from '../api/apiPaths';
import { useEntityEditor, type EntityEditorOf } from '../hooks/useEntityEditor';

const LOAD_ERROR_MESSAGE = 'Не удалось открыть экзамен. Попробуйте ещё раз.';

export type UseExamEditorResult = EntityEditorOf<typeof EXAMS_PATH>;

export function useExamEditor(examId: string | undefined): UseExamEditorResult {
  return useEntityEditor(EXAMS_PATH, examId, LOAD_ERROR_MESSAGE);
}
