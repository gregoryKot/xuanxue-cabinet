// Короткая форма создания вопроса — раскрывается на месте рядом с поиском
// (ExamQuestionsSection.tsx, ADR-0040), не модальное окно и не отдельная
// страница. Поля — те же подкомпоненты, что у страницы вопроса
// (exam-items/ExamItem*Field.tsx): второй ввод типа ответа, формулировки и
// вариантов не пишем (CLAUDE.md «Одна механика — один компонент»). Статуса и
// ссылки на статистику здесь нет — они появляются, когда вопрос уже
// существует (ExamItemEditorForm.tsx), а этот вопрос только создаётся.
import type { CSSProperties } from 'react';
import { FormServerError } from '../components/FormServerError';
import { InlineFormFooter } from '../components/InlineFormFooter';
import { RichText } from '../components/RichText';
import { noteStyle } from '../components/screenLayout';
import { ExamItemFormFields } from '../exam-items/ExamItemFormFields';
import { ExamItemKindField } from '../exam-items/ExamItemKindField';
import { ExamItemOptionsField } from '../exam-items/ExamItemOptionsField';
import { hasOptions } from '../exam-items/examItemFormInput';
import type { ExamItemDto } from '@xuanxue/shared';
import { useNewQuestionForm } from './useNewQuestionForm';

// Прежний текст обещал «сразу попадёт в этот экзамен» — на деле вопрос
// встаёт в список формы, а в экзамене закрепляется следующим сохранением
// (2026-09-21: учитель не нашёл добавленный вопрос «глазами ученика»).
const EXPLANATION =
  'Вопрос сохранится в «Вопросах» и **встанет в список ниже**. ' +
  'В экзамене он закрепится, когда вы нажмёте «Сохранить».';
const SAVE_LABEL = 'Сохранить вопрос';

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: '14px 0',
  borderTop: '1px solid var(--line)',
  borderBottom: '1px solid var(--line)',
};

interface NewQuestionFormProps {
  onCreated: (item: ExamItemDto) => void;
  onCancel: () => void;
}

export function NewQuestionForm({ onCreated, onCancel }: NewQuestionFormProps) {
  const form = useNewQuestionForm();

  async function handleSave() {
    const created = await form.submit();
    if (created) onCreated(created);
  }

  return (
    <div style={wrapStyle}>
      <p style={noteStyle}>
        <RichText text={EXPLANATION} />
      </p>

      <ExamItemKindField
        kind={form.state.kind}
        onChange={(kind) => form.setField('kind', kind)}
      />

      <ExamItemFormFields
        state={form.state}
        setField={form.setField}
        error={form.validationError}
      />

      {hasOptions(form.state.kind) && (
        <ExamItemOptionsField
          kind={form.state.kind}
          options={form.state.options}
          onChange={(options) => form.setField('options', options)}
        />
      )}

      <FormServerError error={form.serverError} />

      <InlineFormFooter
        saveLabel={SAVE_LABEL}
        pending={form.pending}
        onSave={() => void handleSave()}
        onCancel={onCancel}
      />
    </div>
  );
}
