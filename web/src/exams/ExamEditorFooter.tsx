// Тексты подвала страницы редактора экзамена поверх общего
// components/EditorFooter.tsx. Второе действие рядом с «Сохранить» —
// ссылка на страницу предпросмотра сохранённого экзамена (ADR-0033).
// Строки статуса («Опубликовать», «В архив») в подвале нет — она стоит под
// названием экзамена (ExamEditorForm.tsx, components/EditorStatusRow.tsx):
// владелец искал «Опубликовать» наверху, а не в конце длинного списка вопросов.
//
// Удаление разрешено только черновику (ExamsService.remove): на
// опубликованный и архивный экзамен ссылаются попытки учеников — вместо
// кнопки объяснение, почему её нет.
import { Link } from 'react-router-dom';
import type { ExamStatus } from '@xuanxue/shared';
import { EditorFooter } from '../components/EditorFooter';
import { textLinkStyle } from '../components/screenLayout';

const REMOVE_LABEL = 'Удалить экзамен';
const PREVIEW_LABEL = 'Посмотреть глазами ученика';
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

interface ExamEditorFooterProps {
  status: ExamStatus | null;
  pending: boolean;
  /** `null` — новый экзамен, показывать предпросмотр нечего. */
  previewPath: string | null;
  onRemove: () => void;
}

export function ExamEditorFooter({
  status,
  pending,
  previewPath,
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
        previewPath ? (
          <Link to={previewPath} style={textLinkStyle}>
            {PREVIEW_LABEL}
          </Link>
        ) : undefined
      }
    />
  );
}
