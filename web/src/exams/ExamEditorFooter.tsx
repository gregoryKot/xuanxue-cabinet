// Тексты подвала страницы редактора экзамена поверх общего
// components/EditorFooter.tsx. Второе действие рядом с «Сохранить» —
// предпросмотр сохранённого экзамена (ADR-0033). Это кнопка, а не ссылка:
// страница предпросмотра читает экзамен с сервера, поэтому при несохранённых
// правках она сначала сохраняет форму. Раньше отсюда вела ссылка, и учитель
// видел новый вопрос в списке, а «глазами ученика» его не находил
// (2026-09-21) — отсюда и вторая подпись кнопки.
// Строки статуса («Опубликовать», «В архив») в подвале нет — она стоит под
// названием экзамена (ExamEditorForm.tsx, components/EditorStatusRow.tsx):
// владелец искал «Опубликовать» наверху, а не в конце длинного списка вопросов.
//
// Удаление разрешено только черновику (ExamsService.remove): на
// опубликованный и архивный экзамен ссылаются попытки учеников — вместо
// кнопки объяснение, почему её нет.
import type { ExamStatus } from '@xuanxue/shared';
import { EditorFooter } from '../components/EditorFooter';
import { TextLinkButton } from '../components/TextLinkButton';

const REMOVE_LABEL = 'Удалить экзамен';
const PREVIEW_LABEL = 'Посмотреть глазами ученика';
const PREVIEW_SAVE_LABEL = 'Сохранить и посмотреть глазами ученика';
export const EXAM_STATUS_EXPLANATIONS: Record<ExamStatus, string> = {
  draft: 'ученики его не видят',
  published: 'ученики видят его в списке',
  archived: 'ученики его не видят, сданные работы остаются',
};
const NO_REMOVE_NOTES: Record<'published' | 'archived', string> = {
  published:
    'Удалить нельзя — на опубликованный экзамен могут ссылаться попытки учеников. Отправьте его в архив.',
  archived: 'Удалить нельзя — на экзамен в архиве могли остаться ссылки в попытках.',
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
  onRemove: () => void;
}

export function ExamEditorFooter({
  status,
  pending,
  preview,
  onRemove,
}: ExamEditorFooterProps) {
  return (
    <EditorFooter
      status={status}
      statusRow="elsewhere"
      removeLabel={REMOVE_LABEL}
      noRemoveNotes={NO_REMOVE_NOTES}
      pending={pending}
      onRemove={onRemove}
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
