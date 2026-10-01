// Оркестрация страницы материала — состояние, сохранение и удаление, общая
// механика — hooks/useEntityForm.ts (тот же хук, что у канала,
// channels/useChannelForm.ts, и у формы экзамена/вопроса — материал без
// статуса, `never` вторым параметром результата). Логика поля/валидации/
// сборки тела запроса — в materialFormInput.ts (тестируется без React).
//
// Объект-аргумент, не четыре позиционных параметра (CLAUDE.md «параметров
// больше трёх — объект»): `file` — контекст для валидации ссылки (ADR-0134,
// materialFormInput.ts).
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
  type MaterialFormFileContext,
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

export interface UseMaterialFormArgs {
  material: MaterialDto | null;
  /** Есть ли у материала файл (или выбран в форме) и умеет ли экран его
   * прикладывать — решает, обязательна ли ссылка, и как об этом сказать
   * (materialFormInput.ts, ADR-0134). */
  file: MaterialFormFileContext;
  /** Возвращает созданный материал (`useEntityEditor.create`, ADR-0134) — у
   * материала это `useNewMaterialFile.ts`, который следом отправляет файл по
   * id из ответа; `useEntityForm` результат не читает. */
  onCreate: (input: CreateMaterialInput) => Promise<MaterialDto>;
  onUpdate: (id: string, input: UpdateMaterialInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function useMaterialForm({
  material,
  file,
  onCreate,
  onUpdate,
  onRemove,
}: UseMaterialFormArgs): UseMaterialFormResult {
  return useEntityForm({
    entity: material,
    getId: (m) => m.id,
    // Галочка «Сообщить ученикам» у нового материала стоит сразу (ADR-0162): учитель
    // её снимает, а не вспоминает поставить. Короткая форма на странице даты
    // (planning/useNewLessonMaterialForm.ts) берёт исходное состояние — без галочки.
    initialState: (entity) => ({
      ...initialMaterialFormState(entity),
      notifyStudents: entity === null,
    }),
    validate: (state) => validateMaterialForm(state, file),
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
    draftKey: `${DRAFT_DOMAIN}:${material?.id ?? 'new'}`,
  });
}
