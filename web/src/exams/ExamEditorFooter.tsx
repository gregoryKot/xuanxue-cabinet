// Тексты подвала страницы редактора экзамена поверх общего
// components/EditorFooter.tsx: «Сохранить» + предпросмотр (ADR-0033). Второе
// действие рядом с «Сохранить» — предпросмотр сохранённого экзамена. Это
// кнопка, а не ссылка: страница предпросмотра читает экзамен с сервера,
// поэтому при несохранённых правках она сначала сохраняет форму. Раньше
// отсюда вела ссылка, и учитель видел новый вопрос в списке, а «глазами
// ученика» его не находил (2026-09-21) — отсюда и вторая подпись кнопки.
//
// Строки статуса («Опубликовать», «В архив») и удаления в подвале нет —
// обе стоят наверху страницы (ExamEditorForm.tsx, ADR-0139): владелец искал
// «Опубликовать» и «Удалить» наверху, а не в конце длинного списка вопросов,
// и не мог понять, куда делись эти кнопки, пока не долистает форму. Здесь
// остаётся только короткое объяснение, почему опубликованный экзамен не
// удалить — у архивного та же мысль уже сказана строкой статуса наверху
// («сданные работы остаются»), повторять незачем.
import type { ExamStatus } from '@xuanxue/shared';
import { EditorFooter } from '../components/EditorFooter';
import { TextLinkButton } from '../components/TextLinkButton';

const PREVIEW_LABEL = 'Посмотреть глазами ученика';
const PREVIEW_SAVE_LABEL = 'Сохранить и посмотреть глазами ученика';
export const EXAM_STATUS_EXPLANATIONS: Record<ExamStatus, string> = {
  draft: 'ученики его не видят',
  published: 'ученики видят его в списке',
  archived: 'ученики его не видят, сданные работы остаются',
};
const NO_REMOVE_NOTES: Partial<Record<'published' | 'archived', string>> = {
  published: 'Опубликованный экзамен не удалить — его можно отправить в архив.',
};

interface ExamPreviewAction {
  /** В форме есть правки, которых нет на сервере: кнопка сохранит их первой,
   * иначе предпросмотр показал бы экзамен без них. */
  unsaved: boolean;
  onOpen: () => void;
}

interface ExamEditorFooterProps {
  status: ExamStatus | null;
  pending: boolean;
  /** `null` — новый экзамен, показывать предпросмотр нечего. */
  preview: ExamPreviewAction | null;
}

export function ExamEditorFooter({ status, pending, preview }: ExamEditorFooterProps) {
  return (
    <EditorFooter
      status={status}
      statusRow="elsewhere"
      noRemoveNotes={NO_REMOVE_NOTES}
      pending={pending}
      extraAction={
        preview ? (
          <TextLinkButton onClick={preview.onOpen} disabled={pending}>
            {preview.unsaved ? PREVIEW_SAVE_LABEL : PREVIEW_LABEL}
          </TextLinkButton>
        ) : undefined
      }
    />
  );
}
