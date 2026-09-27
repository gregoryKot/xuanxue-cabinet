// Страница вопроса — адрес, а не лист поверх списка (макет Form.dc.html,
// ADR-0033). Сверху вниз: возврат к списку, рубрика с заголовком, тип ответа,
// содержательные поля, варианты ответа у выборочных типов, подвал с
// сохранением и статусом, под ним — «Как отвечают» (ТЗ 4.8).
//
// Удаление разрешено в любом статусе (мягкое удаление, ADR-0140,
// ExamItemsService.remove): вопрос пропадает из банка и из поиска (ADR-0128 →
// ADR-0140), но остаётся в уже собранных экзаменах и в сданных работах.
// Раньше опубликованный и архивный вопрос удалить было нельзя.
import { Link, useNavigate } from 'react-router-dom';
import type { ExamItemDto, ExamItemKind, ExamItemStatus } from '@xuanxue/shared';
import { useFileStorageEnabled } from '../auth/useFileStorageEnabled';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EditorFooter } from '../components/EditorFooter';
import { FormDraftNote } from '../components/FormDraftNote';
import { FormServerError } from '../components/FormServerError';
import { RichText } from '../components/RichText';
import { screenTitleStyle } from '../components/screenLayout';
import {
  backLinkStyle,
  editorHeadingStyle,
  editorPageStyle,
  editorSectionStyle,
} from '../components/editorLayout';
import { useEditorFormActions } from '../hooks/useEditorFormActions';
import { ExamItemFormFields } from './ExamItemFormFields';
import { ExamItemKindField } from './ExamItemKindField';
import { ExamItemOptionsField } from './ExamItemOptionsField';
import { ExamItemStats } from './ExamItemStats';
import { examItemEditorTitle } from './examItemEditorTitle';
import { changeExamItemKind } from './examItemKindChange';
import { hasOptions } from './examItemFormInput';
import { useExamItemForm } from './useExamItemForm';
import type { UseExamItemEditorResult } from './useExamItemEditor';

const ITEMS_PATH = '/exam-items';
const BACK_TEXT = 'К вопросам';
const REMOVE_LABEL = 'Удалить вопрос';
// Вопрос уходит из списка «Вопросы», но остаётся в экзаменах, где уже стоит
// (ADR-0140) — текст явно называет оба места, чтобы учитель не искал его
// потом «пропавшим». Без слова «банк» — язык разработчика, не экрана (ADR-0040).
const REMOVE_MESSAGE =
  'Вопрос пропадёт из списка вопросов. В экзаменах, где он уже стоит, **останется** — уберите его оттуда, если нужно.';
// Предупредить одной строкой до сохранения, без модального окна: правка
// содержательного поля опубликованного вопроса поднимает версию на сервере
// (ExamItemsService.update).
const VERSION_WARNING =
  'Правка обновит версию вопроса — **прежняя формулировка останется в истории** для уже сданных работ.';
const STATUS_EXPLANATIONS: Record<ExamItemStatus, string> = {
  draft: 'в экзамен его не поставить',
  published: 'его можно ставить в экзамены',
  archived: 'в новые экзамены он не пойдёт, сданные работы остаются',
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
  const { formRef, handleSubmit, handleChangeStatus, removeConfirm } =
    useEditorFormActions(form.submit, form.changeStatus, form.remove, goToList);
  const fileStorageEnabled = useFileStorageEnabled();
  const handleKindChange = (kind: ExamItemKind) =>
    changeExamItemKind(kind, form.state, form.setField);

  return (
    <>
      <form ref={formRef} style={editorPageStyle} onSubmit={(e) => void handleSubmit(e)}>
        <Link to={ITEMS_PATH} style={backLinkStyle}>
          {BACK_TEXT}
        </Link>

        <div style={editorHeadingStyle}>
          <span className="xuanxue-eyebrow">Вопрос</span>
          <h1 style={screenTitleStyle}>{examItemEditorTitle(item?.prompt ?? null)}</h1>
          {item?.status === 'published' && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
              <RichText text={VERSION_WARNING} />
            </p>
          )}
        </div>

        <FormDraftNote restored={form.draftRestored} onDiscard={form.discardDraft} />

        <ExamItemKindField
          kind={form.state.kind}
          onChange={item ? undefined : handleKindChange}
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

        <FormServerError error={form.serverError} />

        <div style={editorSectionStyle}>
          <EditorFooter
            status={item ? item.status : null}
            statusRow={{
              explanations: STATUS_EXPLANATIONS,
              onChangeStatus: (status) => void handleChangeStatus(status),
            }}
            removeLabel={REMOVE_LABEL}
            pending={form.pending}
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
