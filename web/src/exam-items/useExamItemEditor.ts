// Данные страницы вопроса — `/exam-items/new` и `/exam-items/:itemId`
// (страница со своим адресом вместо листа поверх списка, ADR-0033). Механика
// общая с редактором экзамена (hooks/useEntityEditor.ts), здесь только путь
// коллекции и текст ошибки на языке домена.
import type {
  CreateExamItemInput,
  ExamItemDto,
  UpdateExamItemInput,
} from '@xuanxue/shared';
import { EXAM_ITEMS_PATH } from '../api/apiPaths';
import { useEntityEditor, type UseEntityEditorResult } from '../hooks/useEntityEditor';

const LOAD_ERROR_MESSAGE = 'Не удалось открыть вопрос. Попробуйте ещё раз.';

export type UseExamItemEditorResult = UseEntityEditorResult<
  ExamItemDto,
  CreateExamItemInput,
  UpdateExamItemInput
>;

export function useExamItemEditor(itemId: string | undefined): UseExamItemEditorResult {
  return useEntityEditor(EXAM_ITEMS_PATH, itemId, LOAD_ERROR_MESSAGE);
}
