// Редактор экзамена — страница с адресом, а не лист поверх списка (макет
// Form.dc.html, ADR-0033). Сверху вниз: название со строкой статуса
// («Опубликовать» / «В архив» — под заголовком, не в подвале: у экзамена
// на 50 вопросов подвал далеко), «О чём экзамен», «Вопросы · N» с поиском и
// «Новый вопрос» (ADR-0040), «Как проходит экзамен», подвал с сохранением.
// Вопросы грузятся один раз на всю страницу
// (useExamItems без фильтров сервера — поиск локальный, examQuestions.ts):
// один запрос обслуживает и список для добавления, и подстановку
// формулировок в выбранных вопросах. Предпросмотр глазами ученика — своя
// страница со своим запросом (ExamPreviewScreen.tsx).
import { Link, useNavigate } from 'react-router-dom';
import type { ExamDto } from '@xuanxue/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EditorStatusRow } from '../components/EditorStatusRow';
import { FormDraftNote } from '../components/FormDraftNote';
import { FormServerError } from '../components/FormServerError';
import { screenTitleStyle } from '../components/screenLayout';
import {
  backLinkStyle,
  editorHeadingStyle,
  editorPageStyle,
  editorSectionStyle,
} from '../components/editorLayout';
import { scrollToFirstAlertSoon } from '../lib/scrollToFirstAlert';
import { useEditorFormActions } from '../hooks/useEditorFormActions';
import { useExamItems } from '../exam-items/useExamItems';
import { ExamAboutFields } from './ExamAboutFields';
import { hasUnsavedChanges } from './examFormInput';
import { EXAM_STATUS_EXPLANATIONS, ExamEditorFooter } from './ExamEditorFooter';
import { ExamFlowFields } from './ExamFlowFields';
import { ExamQuestionsSection } from './ExamQuestionsSection';
import { useExamForm } from './useExamForm';
import type { UseExamEditorResult } from './useExamEditor';

const NO_STATUS_FILTER = '' as const;
const EXAMS_PATH = '/exams';
const BACK_TEXT = 'К списку экзаменов';
const NEW_EXAM_TITLE = 'Новый экзамен';
const REMOVE_MESSAGE = 'Экзамен исчезнет вместе с набором вопросов. Отменить нельзя.';

interface ExamEditorFormProps {
  exam: ExamDto | null;
  editor: UseExamEditorResult;
}

export function ExamEditorForm({ exam, editor }: ExamEditorFormProps) {
  const navigate = useNavigate();
  // `void` у navigate — он возвращает промис (react-router 7), а вызывающие
  // места ждут обычную функцию без результата.
  const goToList = () => void navigate(EXAMS_PATH);
  const form = useExamForm(exam, editor.create, editor.update, editor.remove);
  const bank = useExamItems(NO_STATUS_FILTER);
  const { formRef, handleSubmit, handleChangeStatus, removeConfirm } =
    useEditorFormActions(form.submit, form.changeStatus, form.remove, goToList);
  const unsaved = hasUnsavedChanges(form.state, exam);

  // Предпросмотр — отдельная страница, и читает она сохранённый экзамен
  // (ExamPreviewScreen.tsx, ADR-0033). Поэтому правки уходят на сервер
  // первыми: иначе учитель видит новый вопрос в списке, а «глазами ученика»
  // его нет (2026-09-21). Форма не прошла — остаёмся с ошибкой на месте, как
  // у «Сохранить» (useEditorFormActions.ts).
  async function openPreview(examId: string): Promise<void> {
    if (unsaved && !(await form.submit())) {
      scrollToFirstAlertSoon(formRef.current);
      return;
    }
    void navigate(`${EXAMS_PATH}/${examId}/preview`);
  }

  return (
    <>
      <form ref={formRef} style={editorPageStyle} onSubmit={(e) => void handleSubmit(e)}>
        <Link to={EXAMS_PATH} style={backLinkStyle}>
          {BACK_TEXT}
        </Link>

        <div style={editorHeadingStyle}>
          <span className="xuanxue-eyebrow">Экзамен</span>
          <h1 style={screenTitleStyle}>{exam ? exam.title : NEW_EXAM_TITLE}</h1>
          {exam && (
            <EditorStatusRow
              status={exam.status}
              explanations={EXAM_STATUS_EXPLANATIONS}
              placement="heading"
              pending={form.pending}
              onChangeStatus={(status) => void handleChangeStatus(status)}
            />
          )}
        </div>

        <FormDraftNote restored={form.draftRestored} onDiscard={form.discardDraft} />

        <ExamAboutFields
          state={form.state}
          setField={form.setField}
          error={form.validationError}
        />

        <div style={editorSectionStyle}>
          <ExamQuestionsSection
            itemIds={form.state.questionIds}
            onChange={(itemIds) => form.setField('questionIds', itemIds)}
            bankItems={bank.items}
            bankLoading={bank.loading}
            bankError={bank.error}
            onRetryBank={() => void bank.reload()}
          />
        </div>

        <div style={editorSectionStyle}>
          <span className="xuanxue-eyebrow">Как проходит экзамен</span>
          <ExamFlowFields state={form.state} setField={form.setField} />
        </div>

        <FormServerError error={form.serverError} />

        <div style={editorSectionStyle}>
          <ExamEditorFooter
            status={exam ? exam.status : null}
            pending={form.pending}
            preview={exam ? { unsaved, onOpen: () => void openPreview(exam.id) } : null}
            onRemove={removeConfirm.requestRemove}
          />
        </div>
      </form>

      {removeConfirm.confirming && (
        <ConfirmDialog
          title="Удалить экзамен?"
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
