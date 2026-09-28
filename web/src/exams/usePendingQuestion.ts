// «Сохранить» экзамена при раскрытой форме вопроса (отзыв владельца
// 2026-09-28: «загрузил видео в вопрос, нажал сохранить — вопрос не
// добавился»). У формы «Новый вопрос»/«Изменить» своя кнопка «Добавить в
// экзамен», а «Сохранить» экзамена прилипает к верху страницы (ADR-0139) —
// её и нажимают. Раньше экзамен сохранялся без вопроса, страница уходила на
// список, и вопрос вместе с видео пропадал молча. Теперь любое сохранение
// экзамена (кнопка, смена статуса) сначала сохраняет раскрытую форму и
// добавляет вопрос в экзамен; не прошла проверку — экзамен не сохраняется,
// ошибка видна у формы вопроса (к ней прокручивает useEditorFormActions).
// Нетронутая форма не мешает — в ней нечего терять.
//
// Связь — через контекст, а не проп: форма создания стоит в
// ExamQuestionsSection, форма правки — тремя уровнями ниже, в строке списка
// (ExamQuestionRow), а страница экзамена знает только «есть ли что сохранить».
import { createContext, useContext, useEffect, useRef, type RefObject } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import {
  initialExamItemFormState,
  type ExamItemFormState,
} from '../exam-items/examItemFormInput';
import type { ExamFormState } from './examFormInput';
import { addQuestion } from './examQuestions';

export type PendingQuestionResult =
  { status: 'none' } | { status: 'failed' } | { status: 'saved'; item: ExamItemDto };
type PendingQuestionFlush = () => Promise<PendingQuestionResult>;
type PendingQuestionSlot = RefObject<PendingQuestionFlush | null>;

const NONE: PendingQuestionResult = { status: 'none' };
const FAILED: PendingQuestionResult = { status: 'failed' };

export const PendingQuestionContext = createContext<PendingQuestionSlot | null>(null);

/** Учитель что-то ввёл или загрузил в форму вопроса — сравнение снимков
 * целиком, как hasUnsavedChanges у экзамена (useSaveAndPreview.ts). */
export function isQuestionFormTouched(
  state: ExamItemFormState,
  item: ExamItemDto | null,
): boolean {
  return JSON.stringify(state) !== JSON.stringify(initialExamItemFormState(item));
}

/** Состояние экзамена для сохранения: с только что сохранённым вопросом или
 * `undefined` — сохранять то, что уже в форме. */
export function withPendingQuestion(
  state: ExamFormState,
  result: PendingQuestionResult,
): ExamFormState | undefined {
  if (result.status !== 'saved') return undefined;
  return { ...state, questionIds: addQuestion(state.questionIds, result.item.id) };
}

interface PendingQuestionForm {
  state: ExamItemFormState;
  submit: () => Promise<ExamItemDto | null>;
}

/** В форме вопроса (QuestionInlineForm.tsx): кладёт в слот страницы «сохрани
 * меня» со свежим замыканием на каждой отрисовке. Вне страницы экзамена
 * слота нет — хук ничего не делает. */
export function usePendingQuestionSlot(
  form: PendingQuestionForm,
  item: ExamItemDto | null,
  onSaved: (item: ExamItemDto) => void,
): void {
  const slot = useContext(PendingQuestionContext);
  useEffect(() => {
    if (!slot) return undefined;
    slot.current = async () => {
      if (!isQuestionFormTouched(form.state, item)) return NONE;
      const saved = await form.submit();
      if (!saved) return FAILED;
      onSaved(saved);
      return { status: 'saved', item: saved };
    };
    return () => {
      slot.current = null;
    };
  });
}

export interface UsePendingQuestionResult {
  slot: RefObject<PendingQuestionFlush | null>;
  /** Сначала раскрытая форма вопроса, потом `save` экзамена. */
  saveWith: (save: (next?: ExamFormState) => Promise<boolean>) => Promise<boolean>;
}

/** На странице экзамена (ExamEditorForm.tsx): слот для провайдера контекста
 * и обёртка любого сохранения экзамена. */
export function usePendingQuestion(state: ExamFormState): UsePendingQuestionResult {
  const slot = useRef<PendingQuestionFlush | null>(null);

  async function saveWith(
    save: (next?: ExamFormState) => Promise<boolean>,
  ): Promise<boolean> {
    const result = slot.current ? await slot.current() : NONE;
    if (result.status === 'failed') return false;
    return save(withPendingQuestion(state, result));
  }

  return { slot, saveWith };
}
