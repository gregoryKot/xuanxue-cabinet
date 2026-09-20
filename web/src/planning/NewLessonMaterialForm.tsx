// Короткая форма «Добавить ссылку» — раскрывается на месте, в секции
// «Материалы» страницы даты занятия (ADR-0056, образец — «Новый вопрос» в
// редакторе экзамена, exams/NewQuestionForm.tsx). Не лист и не отдельная
// страница: ссылка, которую учитель обещал группе, у него в руках прямо
// сейчас, уходить за ней некуда.
//
// Поля — те же подкомпоненты, что у страницы материала
// (materials/MaterialBasicFields.tsx). Занятий расписания, доступа и тегов
// здесь нет: у ссылки с конкретной даты они почти всегда пустые, а дозаполнить
// их можно на странице материала — она открыта из «Материалов».
//
// Кнопки — `type="button"`: секция стоит внутри формы занятия
// (LessonEditorForm.tsx), и кнопка по умолчанию отправляла бы её.
import type { CSSProperties } from 'react';
import { FormServerError } from '../components/FormServerError';
import { InlineFormFooter } from '../components/InlineFormFooter';
import { noteStyle } from '../components/screenLayout';
import { MaterialBasicFields } from '../materials/MaterialBasicFields';
import { useNewLessonMaterialForm } from './useNewLessonMaterialForm';

const EXPLANATION = 'Ссылка сохранится в «Материалах» и встанет рядом с этим занятием.';
const SAVE_LABEL = 'Сохранить ссылку';

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: '14px 0',
  borderTop: '1px solid var(--line)',
  borderBottom: '1px solid var(--line)',
};

interface NewLessonMaterialFormProps {
  lessonId: string;
  onCreated: () => void;
  onCancel: () => void;
}

export function NewLessonMaterialForm({
  lessonId,
  onCreated,
  onCancel,
}: NewLessonMaterialFormProps) {
  const form = useNewLessonMaterialForm(lessonId);

  async function handleSave() {
    if (await form.submit()) onCreated();
  }

  return (
    <div style={wrapStyle}>
      <p style={noteStyle}>{EXPLANATION}</p>

      <MaterialBasicFields
        state={form.state}
        setField={form.setField}
        error={form.validationError}
      />

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
