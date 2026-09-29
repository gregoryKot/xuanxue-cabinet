// Короткая форма вопроса, раскрытая на месте в редакторе экзамена — создание
// («Новый вопрос», ExamQuestionsSection.tsx, ADR-0040) и правка уже
// выбранного вопроса (строка списка, ExamQuestionRow.tsx; отзыв владельца
// 2026-09-27: «нельзя отредактировать вопрос после добавления»). Один
// компонент на оба режима, не вторая копия (CLAUDE.md «Одна механика — один
// компонент») — было NewQuestionForm.tsx только под создание. Поля — те же
// подкомпоненты, что у страницы вопроса (exam-items/ExamItem*Field.tsx).
import { useEffect, useRef, type CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { useFileStorageEnabled } from '../auth/useFileStorageEnabled';
import { FormServerError } from '../components/FormServerError';
import { InlineFormFooter } from '../components/InlineFormFooter';
import { noteStyle } from '../components/screenLayout';
import { ExamItemFormFields } from '../exam-items/ExamItemFormFields';
import { ExamItemKindField } from '../exam-items/ExamItemKindField';
import { changeExamItemKind } from '../exam-items/examItemKindChange';
import { ExamItemOptionsField } from '../exam-items/ExamItemOptionsField';
import { ExamItemReasonField } from '../exam-items/ExamItemReasonField';
import { hasOptions } from '../exam-items/examItemFormInput';
import { usePendingQuestionSlot } from './usePendingQuestion';
import { useQuestionInlineForm } from './useQuestionInlineForm';

// Вопрос — общая запись, не копия под конкретный экзамен (ADR-0022): правка
// меняет его во всех экзаменах, где он уже стоит, поэтому это сказано прямо,
// одной строкой, только в режиме правки.
const EDIT_NOTE = 'Изменения попадут во все экзамены с этим вопросом.';
const CREATE_SAVE_LABEL = 'Добавить в экзамен';
const EDIT_SAVE_LABEL = 'Сохранить вопрос';

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: '14px 0',
  borderTop: '1px solid var(--line)',
  borderBottom: '1px solid var(--line)',
};

interface QuestionInlineFormProps {
  /** `null` — форма заводит новый вопрос; существующая запись — правит его
   * на месте, без ухода со страницы экзамена. */
  item: ExamItemDto | null;
  onSaved: (item: ExamItemDto) => void;
  onCancel: () => void;
}

export function QuestionInlineForm({ item, onSaved, onCancel }: QuestionInlineFormProps) {
  const form = useQuestionInlineForm(item);
  const fileStorageEnabled = useFileStorageEnabled();
  const wrapRef = useRef<HTMLDivElement>(null);
  // «Сохранить» экзамена сохраняет и эту форму — вопрос не теряется молча.
  usePendingQuestionSlot(form, item, onSaved);

  // Фокус сразу в формулировку при открытии формы — без этого учитель делал
  // лишний клик по полю, которое и так очевидно первое (отзыв владельца
  // 2026-09-27). Поля вопроса — чужой файл (exam-items/ExamItemFormFields.tsx,
  // его нельзя трогать), поэтому через querySelector обёртки, а не проп поля.
  useEffect(() => {
    wrapRef.current?.querySelector('textarea')?.focus();
  }, []);

  async function handleSave() {
    const saved = await form.submit();
    if (saved) onSaved(saved);
  }

  return (
    <div ref={wrapRef} style={wrapStyle}>
      {item && <p style={noteStyle}>{EDIT_NOTE}</p>}

      <ExamItemKindField
        kind={form.state.kind}
        onChange={
          item ? undefined : (kind) => changeExamItemKind(kind, form.state, form.setField)
        }
      />

      <ExamItemFormFields
        state={form.state}
        setField={form.setField}
        error={form.validationError}
        fileStorageEnabled={fileStorageEnabled}
      />

      {hasOptions(form.state.kind) && (
        <ExamItemOptionsField
          kind={form.state.kind}
          options={form.state.options}
          fileStorageEnabled={fileStorageEnabled}
          onChange={(options) => form.setField('options', options)}
        />
      )}

      <ExamItemReasonField state={form.state} setField={form.setField} />

      <FormServerError error={form.serverError} />

      <InlineFormFooter
        saveLabel={item ? EDIT_SAVE_LABEL : CREATE_SAVE_LABEL}
        pending={form.pending}
        onSave={() => void handleSave()}
        onCancel={onCancel}
      />
    </div>
  );
}
