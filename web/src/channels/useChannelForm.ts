// Оркестрация листа канала — состояние, сохранение и удаление, по образцу
// schedule/useClassForm.ts. Логика поля/валидации/сборки тела запроса — в
// channelFormInput.ts (тестируется без React).
import { useState } from 'react';
import type { ChannelDto, CreateChannelInput, UpdateChannelInput } from '@xuanxue/shared';
import { errorFrom, type FormError } from '../components/FormServerError';
import {
  initialChannelFormState,
  toCreateInput,
  toUpdateInput,
  validateChannelForm,
  type ChannelFormError,
  type ChannelFormState,
} from './channelFormInput';

export interface UseChannelFormResult {
  state: ChannelFormState;
  setField: <K extends keyof ChannelFormState>(
    key: K,
    value: ChannelFormState[K],
  ) => void;
  validationError: ChannelFormError | null;
  serverError: FormError | null;
  pending: boolean;
  submit: () => Promise<boolean>;
  remove: () => Promise<boolean>;
}

export function useChannelForm(
  channelDto: ChannelDto | null,
  onCreate: (input: CreateChannelInput) => Promise<void>,
  onUpdate: (id: string, input: UpdateChannelInput) => Promise<void>,
  onRemove: (id: string) => Promise<void>,
): UseChannelFormResult {
  const [state, setState] = useState<ChannelFormState>(() =>
    initialChannelFormState(channelDto),
  );
  const [validationError, setValidationError] = useState<ChannelFormError | null>(null);
  const [serverError, setServerError] = useState<FormError | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof ChannelFormState>(
    key: K,
    value: ChannelFormState[K],
  ) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(): Promise<boolean> {
    const invalid = validateChannelForm(state, !channelDto, channelDto ?? undefined);
    setValidationError(invalid);
    if (invalid) return false;

    setServerError(null);
    setPending(true);
    try {
      if (channelDto)
        await onUpdate(channelDto.id, toUpdateInput(state, channelDto.type));
      else await onCreate(toCreateInput(state));
      return true;
    } catch (err) {
      setServerError(errorFrom(err, 'Не удалось сохранить. Попробуйте ещё раз.'));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function remove(): Promise<boolean> {
    if (!channelDto) return false;
    setServerError(null);
    setPending(true);
    try {
      await onRemove(channelDto.id);
      return true;
    } catch (err) {
      setServerError(errorFrom(err, 'Не удалось удалить. Попробуйте ещё раз.'));
      return false;
    } finally {
      setPending(false);
    }
  }

  return { state, setField, validationError, serverError, pending, submit, remove };
}
