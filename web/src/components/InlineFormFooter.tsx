// Подвал короткой формы, раскрытой прямо на странице («Новый вопрос» в
// редакторе экзамена, ADR-0040; «Добавить ссылку» на странице даты занятия,
// ADR-0056): сохранить — кнопкой, отменить — текстом рядом. Отмена одна и
// та же во всех таких формах, поэтому подпись здесь, а не в пропе: два
// разных слова для одного действия учат пользователя лишнему.
//
// `type="button"` у обеих: такая форма раскрывается внутри страницы, которая
// сама бывает формой (LessonEditorForm.tsx), и кнопка по умолчанию отправила
// бы её.
import type { CSSProperties } from 'react';
import { Button } from './Button';
import { TextLinkButton } from './TextLinkButton';

const CANCEL_LABEL = 'Отменить';

const footerStyle: CSSProperties = { display: 'flex', gap: 16, alignItems: 'center' };

interface InlineFormFooterProps {
  saveLabel: string;
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function InlineFormFooter({
  saveLabel,
  pending,
  onSave,
  onCancel,
}: InlineFormFooterProps) {
  return (
    <div style={footerStyle}>
      <Button type="button" variant="secondary" pending={pending} onClick={onSave}>
        {saveLabel}
      </Button>
      <TextLinkButton onClick={onCancel}>{CANCEL_LABEL}</TextLinkButton>
    </div>
  );
}
