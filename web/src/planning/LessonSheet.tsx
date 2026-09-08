// Лист создания/правки занятия — полноэкранный диалог через useHistorySheet/
// useDialog (CLAUDE.md «Фронтенд»), по образцу schedule/ClassSheet.tsx.
// Оболочка листа — SheetShell (общая с ClassSheet.tsx). Отмена занятия —
// отдельное подтверждение (ConfirmDialog): необратимо снимает занятие с
// рассылки, случайный клик не должен его отменять.
import { useState, type FormEvent } from 'react';
import type {
  AddRecordingInput,
  ClassDto,
  CreateLessonInput,
  LessonDto,
  TeacherOptionDto,
  UpdateLessonInput,
} from '@xuanxue/shared';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormServerError } from '../components/FormServerError';
import { SheetShell } from '../components/SheetShell';
import { useDialog } from '../hooks/useDialog';
import { useHistorySheet } from '../hooks/useHistorySheet';
import { LessonFormFields } from './LessonFormFields';
import { RecordingSection } from './RecordingSection';
import { SendNowButton } from './SendNowButton';
import { useLessonForm } from './useLessonForm';

interface LessonSheetProps {
  lessonDto: LessonDto | null;
  classes: ClassDto[];
  /** Учителя для select'а «Ведущий» — грузятся один раз на «Планировании»
   * (аудит В4), тот же приём, что classes. */
  teachers: TeacherOptionDto[];
  teachersError?: string | null;
  onRetryTeachers?: () => void;
  onClose: () => void;
  onCreate: (input: CreateLessonInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateLessonInput) => Promise<void>;
  onAddRecording: (id: string, input: AddRecordingInput) => Promise<void>;
  onSendNow: (id: string) => Promise<void>;
}

export function LessonSheet({
  lessonDto,
  classes,
  teachers,
  teachersError,
  onRetryTeachers,
  onClose,
  onCreate,
  onUpdate,
  onAddRecording,
  onSendNow,
}: LessonSheetProps) {
  const goBack = useHistorySheet(onClose);
  const { headingRef } = useDialog(goBack);
  const form = useLessonForm(lessonDto, classes, onCreate, onUpdate);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const cancelled = lessonDto?.status === 'cancelled';
  // Ни одного класса в расписании — LessonFormFields показывает объяснение
  // вместо формы (ревью п.9), сохранять здесь нечего.
  const noClasses = !lessonDto && classes.length === 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await form.submit()) goBack();
  }

  // ConfirmDialog ждёт этот промис перед закрытием (успех или сбой) — сбой
  // (ApiError) остаётся видимым в самом листе, а не пропадает вместе с диалогом.
  async function handleConfirmCancel(): Promise<void> {
    await form.cancelLesson();
  }

  return (
    <>
      <SheetShell
        titleId="lesson-sheet-title"
        title={lessonDto ? 'Дата занятия' : 'Разовое занятие'}
        headingRef={headingRef}
        onSubmit={(e) => void handleSubmit(e)}
        onClose={goBack}
      >
        <LessonFormFields
          state={form.state}
          setField={form.setField}
          error={form.validationError}
          isCreate={!lessonDto}
          classes={classes}
          teachers={teachers}
          teachersError={teachersError}
          onRetryTeachers={onRetryTeachers}
        />

        {!noClasses && <FormServerError error={form.serverError} />}

        {!noClasses && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button type="submit" pending={form.pending}>
              Сохранить
            </Button>
            {lessonDto && !cancelled && (
              <Button
                type="button"
                variant="danger"
                onClick={() => setConfirmingCancel(true)}
              >
                Отменить занятие
              </Button>
            )}
            {lessonDto && cancelled && (
              <Button
                type="button"
                variant="secondary"
                pending={form.pending}
                onClick={() => void form.restoreLesson()}
              >
                Вернуть в расписание
              </Button>
            )}
          </div>
        )}

        {lessonDto && !cancelled && (
          <SendNowButton lessonId={lessonDto.id} onSendNow={onSendNow} />
        )}

        {lessonDto && (
          <RecordingSection
            lessonId={lessonDto.id}
            recordings={lessonDto.recordings}
            onAdd={onAddRecording}
          />
        )}
      </SheetShell>

      {confirmingCancel && (
        <ConfirmDialog
          title="Отменить занятие?"
          message="Ученики не получат ссылку на это занятие, рассылка не уйдёт."
          confirmLabel="Отменить занятие"
          pending={form.pending}
          onConfirm={handleConfirmCancel}
          onCancel={() => setConfirmingCancel(false)}
        />
      )}
    </>
  );
}
