// Редактор экзамена — страница с адресом, а не лист поверх списка (макет
// Form.dc.html, ADR-0033). Сверху вниз: «О чём экзамен», «Вопросы · N» с
// поиском и «Новый вопрос» (ADR-0040), «Как проходит экзамен», подвал с
// сохранением и статусом. Вопросы грузятся один раз на всю страницу
// (useExamItems без фильтров сервера — поиск локальный, examQuestions.ts):
// один запрос обслуживает и список для добавления, и подстановку
// формулировок в выбранных вопросах. Предпросмотр глазами ученика — своя
// страница со своим запросом (ExamPreviewScreen.tsx).
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ExamDto, ExamStatus } from '@xuanxue/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormServerError } from '../components/FormServerError';
import {
  editorHeadingStyle,
  editorPageStyle,
  editorSectionStyle,
  screenTitleStyle,
  textLinkStyle,
} from '../components/screenLayout';
import { useConfirmedRemove } from '../hooks/useConfirmedRemove';
import { useExamItems } from '../exam-items/useExamItems';
import { ExamAboutFields } from './ExamAboutFields';
import { ExamEditorFooter } from './ExamEditorFooter';
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
  const removeConfirm = useConfirmedRemove(form.remove, goToList);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await form.submit()) goToList();
  }

  async function handleChangeStatus(status: ExamStatus) {
    if (await form.changeStatus(status)) goToList();
  }

  return (
    <>
      <form style={editorPageStyle} onSubmit={(e) => void handleSubmit(e)}>
        <Link to={EXAMS_PATH} style={textLinkStyle}>
          {BACK_TEXT}
        </Link>

        <div style={editorHeadingStyle}>
          <span className="xuanxue-eyebrow">Экзамен</span>
          <h1 style={screenTitleStyle}>{exam ? exam.title : NEW_EXAM_TITLE}</h1>
        </div>

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
            previewPath={exam ? `${EXAMS_PATH}/${exam.id}/preview` : null}
            onChangeStatus={(status) => void handleChangeStatus(status)}
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
