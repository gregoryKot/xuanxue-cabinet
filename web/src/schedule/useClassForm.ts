// Оркестрация формы занятия расписания — состояние, сохранение и удаление,
// общая механика — hooks/useEntityForm.ts (тот же хук, что у канала,
// channels/useChannelForm.ts, и материала, materials/useMaterialForm.ts —
// занятие расписания без статуса, `never` вторым параметром результата).
// Логика поля/валидации/сборки тела запроса — в classFormInput.ts
// (тестируется без React). Черновик (ADR-0052, дополнение 2026-09-21):
// раньше формы в списке защищённых не было — случайный «Назад» на телефоне
// стирал набранное расписание молча (аудит 2026-09-21, HIGH).
import type {
  ChannelDto,
  ClassDto,
  CreateClassInput,
  UpdateClassInput,
} from '@xuanxue/shared';
import { useEntityForm, type UseEntityFormResult } from '../hooks/useEntityForm';
import {
  initialClassFormState,
  toCreateInput,
  toUpdateInput,
  validateClassForm,
  type ClassFormState,
} from './classFormInput';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить. Попробуйте ещё раз.';
const REMOVE_ERROR_MESSAGE = 'Не удалось удалить. Попробуйте ещё раз.';
const DRAFT_DOMAIN = 'class';

export type UseClassFormResult = UseEntityFormResult<ClassFormState>;

export function useClassForm(
  classDto: ClassDto | null,
  channels: ChannelDto[],
  onCreate: (input: CreateClassInput) => Promise<void>,
  onUpdate: (id: string, input: UpdateClassInput) => Promise<void>,
  onRemove: (id: string) => Promise<void>,
): UseClassFormResult {
  return useEntityForm({
    entity: classDto,
    getId: (c) => c.id,
    initialState: (c) => initialClassFormState(c, channels),
    validate: validateClassForm,
    toCreateInput,
    toUpdateInput,
    onCreate,
    onUpdate,
    onRemove,
    saveErrorMessage: SAVE_ERROR_MESSAGE,
    removeErrorMessage: REMOVE_ERROR_MESSAGE,
    draftKey: `${DRAFT_DOMAIN}:${classDto?.id ?? 'new'}`,
  });
}
