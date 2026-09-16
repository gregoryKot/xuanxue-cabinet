// Данные страницы редактора экзамена — `/exams/new` и `/exams/:examId`
// (ADR-0033). Механика общая с редактором вопроса (hooks/useEntityEditor.ts),
// здесь только путь коллекции и текст ошибки на языке домена.
import type { CreateExamInput, ExamDto, UpdateExamInput } from '@xuanxue/shared';
import { EXAMS_PATH } from '../api/apiPaths';
import { useEntityEditor, type UseEntityEditorResult } from '../hooks/useEntityEditor';

const LOAD_ERROR_MESSAGE = 'Не удалось открыть экзамен. Попробуйте ещё раз.';

export type UseExamEditorResult = UseEntityEditorResult<
  ExamDto,
  CreateExamInput,
  UpdateExamInput
>;

export function useExamEditor(examId: string | undefined): UseExamEditorResult {
  return useEntityEditor(EXAMS_PATH, examId, LOAD_ERROR_MESSAGE);
}
