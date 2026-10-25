// Оркестрация страницы события — состояние, сохранение и удаление, общая
// механика — hooks/useEntityForm.ts (тот же хук, что у материала и канала).
// Логика полей, валидации и тела запроса — eventFormInput.ts (без React).
import type { SchoolEventDto } from '@xuanxue/shared';
import { useEntityForm, type UseEntityFormResult } from '../hooks/useEntityForm';
import {
  initialEventFormState,
  toCreateInput,
  toUpdateInput,
  validateEventForm,
  type EventFormError,
  type EventFormState,
} from './eventFormInput';
import type { UseEventEditorResult } from './useEventEditor';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить событие. Попробуйте ещё раз.';
const REMOVE_ERROR_MESSAGE = 'Не удалось удалить событие. Попробуйте ещё раз.';
const DRAFT_DOMAIN = 'school-event';

export type UseEventFormResult = UseEntityFormResult<
  EventFormState,
  never,
  EventFormError
>;

export function useEventForm(
  event: SchoolEventDto | null,
  editor: UseEventEditorResult,
): UseEventFormResult {
  return useEntityForm({
    entity: event,
    getId: (entity) => entity.id,
    initialState: initialEventFormState,
    validate: validateEventForm,
    toCreateInput,
    toUpdateInput,
    onCreate: editor.create,
    onUpdate: editor.update,
    onRemove: editor.remove,
    saveErrorMessage: SAVE_ERROR_MESSAGE,
    removeErrorMessage: REMOVE_ERROR_MESSAGE,
    // Черновик (ADR-0052): подробности с оплатой и сроками набирают долго, а
    // за реквизитами часто уходят в другую вкладку. Секретов в событии нет.
    draftKey: `${DRAFT_DOMAIN}:${event?.id ?? 'new'}`,
  });
}
