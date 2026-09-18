// Оркестрация страницы материала — состояние, сохранение и удаление, общая
// механика — hooks/useEntityForm.ts (тот же хук, что у канала,
// channels/useChannelForm.ts, и у формы экзамена/вопроса — материал без
// статуса, `never` вторым параметром результата). Логика поля/валидации/
// сборки тела запроса — в materialFormInput.ts (тестируется без React).
import type {
  CreateMaterialInput,
  MaterialDto,
  UpdateMaterialInput,
} from '@xuanxue/shared';
import { useEntityForm, type UseEntityFormResult } from '../hooks/useEntityForm';
import {
  initialMaterialFormState,
  toCreateInput,
  toUpdateInput,
  validateMaterialForm,
  type MaterialFormError,
  type MaterialFormState,
} from './materialFormInput';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить. Попробуйте ещё раз.';
const REMOVE_ERROR_MESSAGE = 'Не удалось удалить. Попробуйте ещё раз.';
const DRAFT_DOMAIN = 'material';

export type UseMaterialFormResult = UseEntityFormResult<
  MaterialFormState,
  never,
  MaterialFormError
>;

export function useMaterialForm(
  materialDto: MaterialDto | null,
  onCreate: (input: CreateMaterialInput) => Promise<void>,
  onUpdate: (id: string, input: UpdateMaterialInput) => Promise<void>,
  onRemove: (id: string) => Promise<void>,
): UseMaterialFormResult {
  return useEntityForm({
    entity: materialDto,
    getId: (material) => material.id,
    initialState: initialMaterialFormState,
    validate: validateMaterialForm,
    toCreateInput,
    toUpdateInput,
    onCreate,
    onUpdate,
    onRemove,
    saveErrorMessage: SAVE_ERROR_MESSAGE,
    removeErrorMessage: REMOVE_ERROR_MESSAGE,
    // Черновик у формы есть (ADR-0052): длинную ссылку набирают с телефона,
    // а за ней часто уходят в другую вкладку — скопировать адрес книги.
    // Секретов здесь нет, в отличие от формы канала (useChannelForm.ts).
    draftKey: `${DRAFT_DOMAIN}:${materialDto?.id ?? 'new'}`,
  });
}
