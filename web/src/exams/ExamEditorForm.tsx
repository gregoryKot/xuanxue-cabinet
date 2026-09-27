// Редактор экзамена — страница с адресом, а не лист поверх списка (макет
// Form.dc.html, ADR-0033). Сверху вниз: верх страницы (ссылка «назад»,
// удаление, заголовок со статусом, «Сохранить» — ExamEditorHeader.tsx,
// вынесен из-за храповика размера, ADR-0139), «О чём экзамен», «Как проходит
// экзамен», «Вопросы · N» с поиском и «Новый вопрос» (ADR-0040), подвал с
// «Сохранить» ещё раз и предпросмотром. «Сохранить» и «Удалить» стоят и
// наверху, и (первое —) внизу: без верхней пары их не находили сразу — на
// экзамене с полсотни вопросов до подвала нужно долистать, а в первый раз
// новый экзамен выглядел пустым, и было страшно уйти со страницы (ADR-0139,
// отзыв владельца 2026-09-27).
// Настройки — перед списком вопросов, а не после: список длинный (у
// владельца — 50 вопросов), и настройки под ним читались бы «подвалом»,
// который не долистывают (отзыв владельца 2026-09-21). Вопросы грузятся
// один раз на всю страницу
// (useExamItems без фильтров сервера — поиск локальный, examQuestions.ts):
// один запрос обслуживает и список для добавления, и подстановку
// формулировок в выбранных вопросах. Предпросмотр глазами ученика — своя
// страница со своим запросом (ExamPreviewScreen.tsx).
import { useNavigate } from 'react-router-dom';
import type { ExamDto } from '@xuanxue/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormDraftNote } from '../components/FormDraftNote';
import { FormServerError } from '../components/FormServerError';
import { editorPageStyle, editorSectionStyle } from '../components/editorLayout';
import { useEditorFormActions } from '../hooks/useEditorFormActions';
import { useExamItems } from '../exam-items/useExamItems';
import { ExamAboutFields } from './ExamAboutFields';
import { ExamEditorFooter } from './ExamEditorFooter';
import { EXAMS_PATH, ExamEditorHeader } from './ExamEditorHeader';
import { ExamFlowFields } from './ExamFlowFields';
import { ExamQuestionsSection } from './ExamQuestionsSection';
import { pruneRequiredIds, toggleRequired } from './examQuestions';
import { useExamForm } from './useExamForm';
import { hasUnsavedChanges, useSaveAndPreview } from './useSaveAndPreview';
import type { UseExamEditorResult } from './useExamEditor';

const NO_STATUS_FILTER = '' as const;
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
  const preview = useSaveAndPreview(exam, form, formRef);
  const showDraftSafetyNote = !exam || hasUnsavedChanges(form.state, exam);

  // Вопрос убрали из списка — отметка «обязательный» уходит вместе с ним
  // (ADR-0082, дополнение); на добавлении и перестановке — просто нет эффекта.
  function handleQuestionIdsChange(itemIds: string[]) {
    form.setField('questionIds', itemIds);
    form.setField('requiredIds', pruneRequiredIds(form.state.requiredIds, itemIds));
  }

  return (
    <>
      <form ref={formRef} style={editorPageStyle} onSubmit={(e) => void handleSubmit(e)}>
        <ExamEditorHeader
          exam={exam}
          pending={form.pending}
          showDraftSafetyNote={showDraftSafetyNote}
          onChangeStatus={(status) => void handleChangeStatus(status)}
          onRequestRemove={removeConfirm.requestRemove}
        />

        <FormDraftNote restored={form.draftRestored} onDiscard={form.discardDraft} />

        <ExamAboutFields
          state={form.state}
          setField={form.setField}
          error={form.validationError}
        />

        <div style={editorSectionStyle}>
          <span className="xuanxue-eyebrow">Как проходит экзамен</span>
          <ExamFlowFields state={form.state} setField={form.setField} />
        </div>

        <div style={editorSectionStyle}>
          <ExamQuestionsSection
            itemIds={form.state.questionIds}
            onChange={handleQuestionIdsChange}
            requiredIds={form.state.requiredIds}
            requiredEnabled={form.state.questionsPerAttemptText.trim() !== ''}
            onToggleRequired={(itemId) =>
              form.setField('requiredIds', toggleRequired(form.state.requiredIds, itemId))
            }
            bankItems={bank.items}
            bankLoading={bank.loading}
            bankError={bank.error}
            onRetryBank={() => void bank.reload()}
            examId={exam?.id}
          />
        </div>

        <FormServerError error={form.serverError} />

        <div style={editorSectionStyle}>
          <ExamEditorFooter
            status={exam ? exam.status : null}
            pending={form.pending}
            preview={exam ? preview : null}
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
