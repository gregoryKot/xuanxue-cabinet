// Тексты подвала страницы редактора экзамена поверх общего
// components/EditorFooter.tsx. Второе действие рядом с «Сохранить» —
// предпросмотр глазами ученика.
//
// Удаление разрешено только черновику (ExamsService.remove): на
// опубликованный и архивный экзамен ссылаются попытки учеников — вместо
// кнопки объяснение, почему её нет.
import type { ExamStatus } from '@xuanxue/shared';
import { EditorFooter } from '../components/EditorFooter';
import { textLinkButtonStyle } from '../components/screenLayout';

const REMOVE_LABEL = 'Удалить экзамен';
const PREVIEW_LABEL = 'Посмотреть глазами ученика';
const STATUS_EXPLANATIONS: Record<ExamStatus, string> = {
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
  onPreview: () => void;
  onChangeStatus: (status: ExamStatus) => void;
  onRemove: () => void;
}

export function ExamEditorFooter({
  status,
  pending,
  onPreview,
  onChangeStatus,
  onRemove,
}: ExamEditorFooterProps) {
  return (
    <EditorFooter
      status={status}
      explanations={STATUS_EXPLANATIONS}
      removeLabel={REMOVE_LABEL}
      noRemoveNotes={NO_REMOVE_NOTES}
      pending={pending}
      onChangeStatus={onChangeStatus}
      onRemove={onRemove}
      extraAction={
        <button type="button" style={textLinkButtonStyle} onClick={onPreview}>
          {PREVIEW_LABEL}
        </button>
      }
    />
  );
}
