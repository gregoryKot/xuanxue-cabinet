// Оркестрация листа канала — состояние, сохранение и удаление, общая
// механика — hooks/useEntityForm.ts (тот же хук, что у формы экзамена и
// вопроса, только без статуса — `never` вторым параметром результата;
// материал сохраняет и удаляет тем же приёмом, materials/useMaterialForm.ts).
// Логика поля/валидации/сборки тела запроса — в channelFormInput.ts
// (тестируется без React).
import type { ChannelDto, CreateChannelInput, UpdateChannelInput } from '@xuanxue/shared';
import { useEntityForm, type UseEntityFormResult } from '../hooks/useEntityForm';
import {
  initialChannelFormState,
  toCreateInput,
  toUpdateInput,
  validateChannelForm,
  type ChannelFormError,
  type ChannelFormState,
} from './channelFormInput';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить. Попробуйте ещё раз.';
const REMOVE_ERROR_MESSAGE = 'Не удалось удалить. Попробуйте ещё раз.';

export type UseChannelFormResult = UseEntityFormResult<
  ChannelFormState,
  never,
  ChannelFormError
>;

export function useChannelForm(
  channelDto: ChannelDto | null,
  onCreate: (input: CreateChannelInput) => Promise<void>,
  onUpdate: (id: string, input: UpdateChannelInput) => Promise<void>,
  onRemove: (id: string) => Promise<void>,
): UseChannelFormResult {
  return useEntityForm({
    entity: channelDto,
    getId: (channel) => channel.id,
    initialState: initialChannelFormState,
    validate: (state) => validateChannelForm(state, !channelDto, channelDto ?? undefined),
    toCreateInput,
    // `?? 'manual'` — эта сборка вызывается только когда `channelDto` не
    // `null` (useEntityForm зовёт toUpdateInput лишь при `entity`),
    // заглушка нужна только чтобы пройти tsc, второй веткой она не бывает.
    toUpdateInput: (state) => toUpdateInput(state, channelDto?.type ?? 'manual'),
    onCreate,
    onUpdate,
    onRemove,
    saveErrorMessage: SAVE_ERROR_MESSAGE,
    removeErrorMessage: REMOVE_ERROR_MESSAGE,
    // Черновика у формы канала нет намеренно (ADR-0052: `null` — осознанный
    // отказ). В этой форме набирают токен бота и ключ сообщества ВК — самое
    // дорогое, что есть у школы (SECURITY §1). Черновик кладёт набранное в
    // `localStorage` открытым текстом на неделю, а «токены в localStorage
    // запрещены» (CLAUDE.md «Безопасность») — ради удобства формы из трёх
    // полей это правило не нарушается.
    draftKey: null,
  });
}
