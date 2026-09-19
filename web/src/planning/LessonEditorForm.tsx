// Страница занятия — адрес, а не лист поверх списка (ADR-0033, образец —
// exam-items/ExamItemEditorForm.tsx). Сверху вниз: возврат к «Занятиям»,
// рубрика с датой, поля занятия, подвал с сохранением и отменой занятия,
// ниже — «Отправить ссылку сейчас» и записи.
//
// Отмена занятия идёт через подтверждение (ConfirmDialog + useConfirmedRemove):
// она снимает занятие с рассылки, случайное касание не должно её вызывать.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AddRecordingInput, ClassDto, LessonDto } from '@xuanxue/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormServerError } from '../components/FormServerError';
import { screenTitleStyle } from '../components/screenLayout';
import {
  backLinkStyle,
  editorHeadingStyle,
  editorPageStyle,
  editorSectionStyle,
} from '../components/editorLayout';
import { useConfirmedRemove } from '../hooks/useConfirmedRemove';
import { formatDateTime } from '../lib/formatDate';
import { useTeachers } from '../people/useTeachers';
import { LessonEditorFooter } from './LessonEditorFooter';
import { LessonFormFields } from './LessonFormFields';
import { RecordingSection } from './RecordingSection';
import { SendNowButton } from './SendNowButton';
import { useLessonForm } from './useLessonForm';
import type { UseLessonEditorResult } from './useLessonEditor';

const PLANNING_PATH = '/planning';
const BACK_TEXT = 'К занятиям';
const EYEBROW = 'Занятие';
const NEW_LESSON_TITLE = 'Разовое занятие';
const CANCEL_MESSAGE = 'Ученики не получат ссылку на это занятие, рассылка не уйдёт.';

interface LessonEditorFormProps {
  /** `null` — `/planning/new`, разовое занятие, которого ещё нет. */
  lesson: LessonDto | null;
  /** Занятия расписания: к одному из них привязывается разовое занятие, из
   * него же наследуется ссылка Zoom (LessonFormFields.tsx). */
  classes: ClassDto[];
  editor: UseLessonEditorResult;
}

export function LessonEditorForm({ lesson, classes, editor }: LessonEditorFormProps) {
  const navigate = useNavigate();
  // `void` у navigate — он возвращает промис (react-router 7), а вызывающие
  // места ждут обычную функцию без результата.
  const goToList = () => void navigate(PLANNING_PATH);
  const form = useLessonForm(lesson, classes, editor.create, editor.update);
  const teachersState = useTeachers();
  const cancelConfirm = useConfirmedRemove(form.cancelLesson, goToList);
  // Записи живут в состоянии страницы: ответ POST /lessons/:id/recording —
  // занятие целиком, из него и берётся новый список (useLessonEditor.ts).
  const [recordings, setRecordings] = useState(lesson?.recordings ?? []);
  const cancelled = lesson?.status === 'cancelled';
  // Ни одного занятия в расписании — LessonFormFields показывает объяснение
  // вместо формы (ревью п.9), сохранять здесь нечего.
  const noClasses = !lesson && classes.length === 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await form.submit()) goToList();
  }

  async function handleRestore() {
    if (await form.restoreLesson()) goToList();
  }

  async function handleAddRecording(id: string, input: AddRecordingInput) {
    setRecordings((await editor.addRecording(id, input)).recordings);
  }

  return (
    <>
      <form style={editorPageStyle} onSubmit={(e) => void handleSubmit(e)}>
        <Link to={PLANNING_PATH} style={backLinkStyle}>
          {BACK_TEXT}
        </Link>

        <div style={editorHeadingStyle}>
          <span className="xuanxue-eyebrow">{EYEBROW}</span>
          <h1 style={screenTitleStyle}>
            {lesson ? formatDateTime(lesson.startsAt) : NEW_LESSON_TITLE}
          </h1>
        </div>

        <LessonFormFields
          state={form.state}
          setField={form.setField}
          error={form.validationError}
          isCreate={!lesson}
          classes={classes}
          teachers={teachersState.teachers ?? []}
          teachersError={teachersState.error}
          onRetryTeachers={() => void teachersState.reload()}
        />

        {!noClasses && (
          <>
            <FormServerError error={form.serverError} />

            <div style={editorSectionStyle}>
              <LessonEditorFooter
                saved={lesson !== null}
                cancelled={cancelled}
                pending={form.pending}
                onRestore={() => void handleRestore()}
                onRequestCancel={cancelConfirm.requestRemove}
              />
            </div>
          </>
        )}

        {lesson && !cancelled && (
          <div style={editorSectionStyle}>
            <SendNowButton lessonId={lesson.id} onSendNow={editor.sendNow} />
          </div>
        )}

        {lesson && (
          <div style={editorSectionStyle}>
            <RecordingSection
              lessonId={lesson.id}
              recordings={recordings}
              onAdd={handleAddRecording}
            />
          </div>
        )}
      </form>

      {cancelConfirm.confirming && (
        <ConfirmDialog
          title="Отменить занятие?"
          message={CANCEL_MESSAGE}
          confirmLabel="Отменить занятие"
          pending={form.pending}
          onConfirm={cancelConfirm.confirmRemove}
          onCancel={cancelConfirm.cancelRemove}
        />
      )}
    </>
  );
}
