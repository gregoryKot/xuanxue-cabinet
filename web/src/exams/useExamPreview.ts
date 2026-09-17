// Данные страницы предпросмотра экзамена «глазами ученика» —
// `/exams/:examId/preview` (ADR-0033, ТЗ 4.3). Страницу открывают по ссылке
// со страницы экзамена: рядом нет ни списка, ни формы — оба ресурса читает
// сама страница. Экзамен — уже существующим useExamEditor (свой
// `GET /exams/:id`, текст ошибки открытия записи по адресу — та же механика,
// что у редактора). Вопросы — отдельным запросом (useExamItems), потому что в
// экзамене хранятся только `itemIds`, а не сами формулировки.
import type { ExamDto, ExamItemDto } from '@xuanxue/shared';
import { useExamItems } from '../exam-items/useExamItems';
import { useExamEditor } from './useExamEditor';

const NO_STATUS_FILTER = '' as const;

export interface UseExamPreviewResult {
  exam: ExamDto | null;
  /** Пока вопросы не загружены — пустой список, а не `null`: странице проще
   * показывать вопросы без лишней развилки на «вопросы ещё не пришли». */
  bankItems: ExamItemDto[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useExamPreview(examId: string | undefined): UseExamPreviewResult {
  const exam = useExamEditor(examId);
  const bank = useExamItems(NO_STATUS_FILTER);

  async function reload(): Promise<void> {
    await Promise.all([exam.reload(), bank.reload()]);
  }

  return {
    exam: exam.entity,
    bankItems: bank.items ?? [],
    loading: exam.loading || bank.loading,
    error: exam.error ?? bank.error,
    reload,
  };
}
