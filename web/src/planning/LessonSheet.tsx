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
import { useLessonForm } from './useLessonForm';

interface LessonSheetProps {
  lessonDto: LessonDto | null;
  classes: ClassDto[];
  onClose: () => void;
  onCreate: (input: CreateLessonInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateLessonInput) => Promise<void>;
  onAddRecording: (id: string, input: AddRecordingInput) => Promise<void>;
}

export function LessonSheet({
  lessonDto,
  classes,
  onClose,
  onCreate,
  onUpdate,
  onAddRecording,
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

  async function handleConfirmCancel() {
    // Результат игнорируем — ConfirmDialog сам закрывается после ответа
    // сервера (успех или сбой), лист занятия остаётся открытым: сбой
    // (ApiError) показывается в нём же, а не пропадает вместе с диалогом
    // подтверждения.
    await form.cancelLesson();
  }

  async function handleRestore() {
    await form.restoreLesson();
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
                onClick={() => void handleRestore()}
              >
                Вернуть в расписание
              </Button>
            )}
          </div>
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
