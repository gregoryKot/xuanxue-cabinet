// Кнопка «Посмотреть глазами ученика» в подвале редактора
// (ExamEditorFooter.tsx). Предпросмотр — отдельная страница и читает
// сохранённый экзамен своим запросом (ExamPreviewScreen.tsx, ADR-0033),
// поэтому несохранённые правки уходят на сервер первыми: иначе учитель видит
// добавленный вопрос в списке «Вопросы · N», а «глазами ученика» его нет
// (2026-09-21, жалоба владельца). Логика живёт здесь, а не в компоненте
// (CLAUDE.md «Логика вне контроллеров и компонентов») — заодно редактор
// остаётся в пределах храповика размера.
import type { RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ExamDto } from '@xuanxue/shared';
import { scrollToFirstAlertSoon } from '../lib/scrollToFirstAlert';
import { initialExamFormState, type ExamFormState } from './examFormInput';
import type { UseExamFormResult } from './useExamForm';

const EXAMS_PATH = '/exams';

/** Есть ли в форме правки, которых нет на сервере. Снимки сравниваются
 * целиком, как `dirty` у черновика (hooks/useFormDraft.ts): второй перечень
 * полей разъехался бы с первым при любом новом поле формы — так уже вышло у
 * черновика старого бандла (#321). */
export function hasUnsavedChanges(state: ExamFormState, exam: ExamDto | null): boolean {
  return JSON.stringify(state) !== JSON.stringify(initialExamFormState(exam));
}

/** Ложится в проп `preview` подвала (ExamEditorFooter.tsx) как есть. */
export interface UseSaveAndPreviewResult {
  unsaved: boolean;
  onOpen: () => void;
}

/** `form` — целиком результат useExamForm, а не пара полей россыпью: иначе
 * параметров стало бы четыре (CLAUDE.md «Код»). `exam` — `null` у нового
 * экзамена: показывать нечего, кнопки предпросмотра у него нет. */
export function useSaveAndPreview(
  exam: ExamDto | null,
  form: Pick<UseExamFormResult, 'state' | 'submit'>,
  formRef: RefObject<HTMLFormElement | null>,
): UseSaveAndPreviewResult {
  const navigate = useNavigate();
  const unsaved = hasUnsavedChanges(form.state, exam);

  // Форма не прошла проверку — остаёмся на месте с прокруткой к ошибке, как
  // у «Сохранить» (hooks/useEditorFormActions.ts): уходить на предпросмотр,
  // спрятав ошибку, было бы хуже молчания.
  async function saveThenGo(examId: string): Promise<void> {
    if (unsaved && !(await form.submit())) {
      scrollToFirstAlertSoon(formRef.current);
      return;
    }
    // `void` у navigate — он возвращает промис (react-router 7).
    void navigate(`${EXAMS_PATH}/${examId}/preview`);
  }

  function onOpen(): void {
    if (exam) void saveThenGo(exam.id);
  }

  return { unsaved, onOpen };
}
