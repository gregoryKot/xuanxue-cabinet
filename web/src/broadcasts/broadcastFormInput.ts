// Чистая логика листа «Новая рассылка» — состояние, валидация, сборка тела
// запроса (CLAUDE.md «Тесты»), по образцу channels/channelFormInput.ts:
// ошибка — `{ field, message }`, чтобы форма показала её под конкретным
// полем и перевела туда фокус (pr-k3-fixes.md п.6), а не только текстом
// сверху формы.
import { BROADCAST_LIMITS, type CreateBroadcastInput } from '@xuanxue/shared';
import { fromDatetimeLocalValue } from '../lib/formatDate';

export interface BroadcastFormState {
  text: string;
  channelIds: string[];
  scheduleNow: boolean;
  scheduledAtLocal: string;
}

export function initialBroadcastFormState(): BroadcastFormState {
  return { text: '', channelIds: [], scheduleNow: true, scheduledAtLocal: '' };
}

/** `null` — форма валидна; иначе поле с ошибкой (BroadcastFormFields рисует
 * её под этим полем и переводит туда фокус) и текст. */
export interface BroadcastFormError {
  field: keyof BroadcastFormState;
  message: string;
}

export function validateBroadcastForm(
  state: BroadcastFormState,
): BroadcastFormError | null {
  if (!state.text.trim()) return { field: 'text', message: 'Впишите текст рассылки.' };
  if (state.text.length > BROADCAST_LIMITS.text) {
    return { field: 'text', message: `Текст длиннее ${BROADCAST_LIMITS.text} знаков.` };
  }
  if (state.channelIds.length === 0) {
    return { field: 'channelIds', message: 'Выберите хотя бы один канал.' };
  }
  if (state.channelIds.length > BROADCAST_LIMITS.channelsMax) {
    return {
      field: 'channelIds',
      message: `Каналов больше ${BROADCAST_LIMITS.channelsMax} — разделите рассылку.`,
    };
  }
  if (!state.scheduleNow) {
    if (!state.scheduledAtLocal) {
      return { field: 'scheduledAtLocal', message: 'Укажите время отправки.' };
    }
    if (fromDatetimeLocalValue(state.scheduledAtLocal) === null) {
      return { field: 'scheduledAtLocal', message: 'Время отправки указано неверно.' };
    }
  }
  return null;
}

export function toCreateInput(state: BroadcastFormState): CreateBroadcastInput {
  const input: CreateBroadcastInput = { text: state.text, channelIds: state.channelIds };
  if (!state.scheduleNow) {
    input.scheduledAt = fromDatetimeLocalValue(state.scheduledAtLocal) ?? undefined;
  }
  return input;
}
