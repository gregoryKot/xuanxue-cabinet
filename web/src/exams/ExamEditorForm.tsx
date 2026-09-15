// Редактор экзамена — страница с адресом, а не лист поверх списка (макет
// Form.dc.html, ADR-0033). Сверху вниз: «О чём экзамен», «Вопросы · N» с
// поиском по банку, «Как проходит экзамен», подвал с сохранением и статусом.
// Банк грузится один раз на всю страницу (useExamItems без фильтров сервера —
// поиск локальный, examQuestionList.ts): один запрос обслуживает и список для
// добавления, и подстановку формулировок в выбранных вопросах, и предпросмотр.
import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ExamDto, ExamStatus } from '@xuanxue/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormServerError } from '../components/FormServerError';
import {
  screenSectionStyle,
  screenTitleStyle,
  textLinkStyle,
} from '../components/screenLayout';
import { useConfirmedRemove } from '../hooks/useConfirmedRemove';
import { useExamItems } from '../exam-items/useExamItems';
import { ExamAboutFields } from './ExamAboutFields';
import { ExamEditorFooter } from './ExamEditorFooter';
import { ExamFlowFields } from './ExamFlowFields';
import { ExamPreview } from './ExamPreview';
import { ExamQuestionsSection } from './ExamQuestionsSection';
import { useExamForm } from './useExamForm';
import type { UseExamEditorResult } from './useExamEditor';

const BANK_FILTERS = { status: '' as const, kind: '' as const, tag: '' };
const EXAMS_PATH = '/exams';
const BACK_TEXT = 'К списку экзаменов';
const NEW_EXAM_TITLE = 'Новый экзамен';
const REMOVE_MESSAGE = 'Экзамен исчезнет вместе с набором вопросов. Отменить нельзя.';

// Колонка уже, чем у экрана-списка: строка поля во всю ширину монитора
// нечитаема, и владелец на это указал прямо (отзыв 2026-09-15).
const COLUMN_MAX_WIDTH_PX = 680;

const pageStyle: CSSProperties = {
  ...screenSectionStyle,
  maxWidth: COLUMN_MAX_WIDTH_PX,
  gap: 24,
};
const headingBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const sectionStyle: CSSProperties = {
  paddingTop: 24,
  borderTop: '1px solid var(--line)',
};

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
  const bank = useExamItems(BANK_FILTERS);
  const [previewOpen, setPreviewOpen] = useState(false);
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
      <form style={pageStyle} onSubmit={(e) => void handleSubmit(e)}>
        <Link to={EXAMS_PATH} style={textLinkStyle}>
          {BACK_TEXT}
        </Link>

        <div style={headingBlockStyle}>
          <span className="xuanxue-eyebrow">Экзамен</span>
          <h1 style={screenTitleStyle}>{exam ? exam.title : NEW_EXAM_TITLE}</h1>
        </div>

        <ExamAboutFields
          state={form.state}
          setField={form.setField}
          error={form.validationError}
        />

        <div style={sectionStyle}>
          <ExamQuestionsSection
            itemIds={form.state.questionIds}
            onChange={(itemIds) => form.setField('questionIds', itemIds)}
            bankItems={bank.items}
            bankLoading={bank.loading}
            bankError={bank.error}
            onRetryBank={() => void bank.reload()}
          />
        </div>

        <div style={sectionStyle}>
          <span className="xuanxue-eyebrow">Как проходит экзамен</span>
          <ExamFlowFields state={form.state} setField={form.setField} />
        </div>

        <FormServerError error={form.serverError} />

        <div style={sectionStyle}>
          <ExamEditorFooter
            status={exam ? exam.status : null}
            pending={form.pending}
            onPreview={() => setPreviewOpen(true)}
            onChangeStatus={(status) => void handleChangeStatus(status)}
            onRemove={removeConfirm.requestRemove}
          />
        </div>
      </form>

      {previewOpen && (
        <ExamPreview
          title={form.state.title}
          description={form.state.description}
          itemIds={form.state.questionIds}
          shuffleQuestions={form.state.shuffleQuestions}
          shuffleOptions={form.state.shuffleOptions}
          bankItems={bank.items ?? []}
          bankLoading={bank.loading}
          onClose={() => setPreviewOpen(false)}
        />
      )}

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
