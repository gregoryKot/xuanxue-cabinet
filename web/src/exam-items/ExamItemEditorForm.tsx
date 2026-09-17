// Страница вопроса — адрес, а не лист поверх списка (макет Form.dc.html,
// ADR-0033). Сверху вниз: возврат к списку, рубрика с заголовком, тип ответа,
// содержательные поля, варианты ответа у выборочных типов, подвал с
// сохранением и статусом, под ним — «Как отвечают» (ТЗ 4.8).
//
// Удаление разрешено только черновику (ExamItemsService.remove): на
// опубликованный или архивный вопрос могут ссылаться сданные работы — вместо
// кнопки объяснение, почему её нет.
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ExamItemDto, ExamItemStatus } from '@xuanxue/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EditorFooter } from '../components/EditorFooter';
import { FormServerError } from '../components/FormServerError';
import {
  editorHeadingStyle,
  editorPageStyle,
  editorSectionStyle,
  screenTitleStyle,
  textLinkStyle,
} from '../components/screenLayout';
import { useConfirmedRemove } from '../hooks/useConfirmedRemove';
import { ExamItemFormFields } from './ExamItemFormFields';
import { ExamItemKindField } from './ExamItemKindField';
import { ExamItemOptionsField } from './ExamItemOptionsField';
import { ExamItemStats } from './ExamItemStats';
import { examItemEditorTitle } from './examItemEditorTitle';
import { hasOptions } from './examItemFormInput';
import { useExamItemForm } from './useExamItemForm';
import type { UseExamItemEditorResult } from './useExamItemEditor';

const ITEMS_PATH = '/exam-items';
const BACK_TEXT = 'К вопросам';
const REMOVE_LABEL = 'Удалить вопрос';
const REMOVE_MESSAGE =
  'Черновик вопроса исчезнет вместе с формулировкой и вариантами ответа. Отменить нельзя.';
// Предупредить одной строкой до сохранения, без модального окна: правка
// содержательного поля опубликованного вопроса поднимает версию на сервере
// (ExamItemsService.update).
const VERSION_WARNING =
  'Правка обновит версию вопроса — прежняя формулировка останется в истории для уже сданных работ.';
const STATUS_EXPLANATIONS: Record<ExamItemStatus, string> = {
  draft: 'в экзамен его не поставить',
  published: 'его можно ставить в экзамены',
  archived: 'в новые экзамены он не пойдёт, сданные работы остаются',
};
const NO_REMOVE_NOTES: Record<'published' | 'archived', string> = {
  published:
    'Удалить нельзя — на опубликованный вопрос могут ссылаться сданные работы. Отправьте его в архив.',
  archived:
    'Удалить нельзя — на вопрос в архиве могли остаться ссылки в сданных работах.',
};

interface ExamItemEditorFormProps {
  item: ExamItemDto | null;
  editor: UseExamItemEditorResult;
}

export function ExamItemEditorForm({ item, editor }: ExamItemEditorFormProps) {
  const navigate = useNavigate();
  // `void` у navigate — он возвращает промис (react-router 7), а вызывающие
  // места ждут обычную функцию без результата.
  const goToList = () => void navigate(ITEMS_PATH);
  const form = useExamItemForm(item, editor.create, editor.update, editor.remove);
  const removeConfirm = useConfirmedRemove(form.remove, goToList);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await form.submit()) goToList();
  }

  async function handleChangeStatus(status: ExamItemStatus) {
    if (await form.changeStatus(status)) goToList();
  }

  return (
    <>
      <form style={editorPageStyle} onSubmit={(e) => void handleSubmit(e)}>
        <Link to={ITEMS_PATH} style={textLinkStyle}>
          {BACK_TEXT}
        </Link>

        <div style={editorHeadingStyle}>
          <span className="xuanxue-eyebrow">Вопрос</span>
          <h1 style={screenTitleStyle}>{examItemEditorTitle(item?.prompt ?? null)}</h1>
          {item?.status === 'published' && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
              {VERSION_WARNING}
            </p>
          )}
        </div>

        <ExamItemKindField
          kind={form.state.kind}
          onChange={item ? undefined : (kind) => form.setField('kind', kind)}
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

        <div style={editorSectionStyle}>
          <EditorFooter
            status={item ? item.status : null}
            explanations={STATUS_EXPLANATIONS}
            removeLabel={REMOVE_LABEL}
            noRemoveNotes={NO_REMOVE_NOTES}
            pending={form.pending}
            onChangeStatus={(status) => void handleChangeStatus(status)}
            onRemove={removeConfirm.requestRemove}
          />
        </div>

        {item && (
          <div style={editorSectionStyle}>
            <span className="xuanxue-eyebrow">Как отвечают</span>
            <ExamItemStats itemId={item.id} />
          </div>
        )}
      </form>

      {removeConfirm.confirming && (
        <ConfirmDialog
          title="Удалить вопрос?"
          message={REMOVE_MESSAGE}
          confirmLabel="Удалить"
          pending={form.pending}
          onConfirm={removeConfirm.confirmRemove}
          onCancel={removeConfirm.cancelRemove}
        />
      )}
    </>
  );
}
