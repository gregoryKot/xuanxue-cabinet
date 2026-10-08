// Страница события школы — адрес, а не лист поверх доски (ADR-0033,
// ADR-0177). Каркас (возврат, рубрика, «Сохранить», «Удалить» с
// подтверждением) — общий components/SimpleEditorForm.tsx, здесь только
// тексты и поля. После сохранения и удаления — на доску: события живут там,
// списка событий отдельным экраном нет.
import type { SchoolEventDto } from '@xuanxue/shared';
import { BOARD_PATH } from '../app/screenAccess';
import { FormDraftNote } from '../components/FormDraftNote';
import { SimpleEditorForm } from '../components/SimpleEditorForm';
import { EventFormFields } from './EventFormFields';
import { useEventForm } from './useEventForm';
import type { UseEventEditorResult } from './useEventEditor';

const BACK_TEXT = 'На главную';
const NEW_EVENT_TITLE = 'Новое событие';
const REMOVE_LABEL = 'Удалить событие';
const REMOVE_MESSAGE = 'Событие исчезнет у всех учеников. Отменить нельзя.';

interface EventEditorFormProps {
  event: SchoolEventDto | null;
  editor: UseEventEditorResult;
}

export function EventEditorForm({ event, editor }: EventEditorFormProps) {
  const form = useEventForm(event, editor);

  return (
    <SimpleEditorForm
      backPath={BOARD_PATH}
      backText={BACK_TEXT}
      eyebrow="Событие"
      title={event ? event.title : NEW_EVENT_TITLE}
      serverError={form.serverError}
      pending={form.pending}
      onSubmit={form.submit}
      remove={
        event
          ? {
              label: REMOVE_LABEL,
              confirmTitle: 'Удалить событие?',
              confirmMessage: REMOVE_MESSAGE,
              onRemove: form.remove,
            }
          : undefined
      }
    >
      <FormDraftNote restored={form.draftRestored} onDiscard={form.discardDraft} />
      <EventFormFields
        state={form.state}
        setField={form.setField}
        error={form.validationError}
      />
    </SimpleEditorForm>
  );
}
