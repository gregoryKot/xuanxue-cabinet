// Поля канала VK — токен сообщества и ID беседы (SECURITY §3). Вынесены из
// ChannelFormFields.tsx (CLAUDE.md «Файлы»): файл стоял у потолка размера
// храповика, дробим при первом же росте, а не растим дальше.
import { CHANNEL_LIMITS } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { errorFor, type ChannelFormError, type ChannelFormState } from './channelFormInput';

interface ChannelVkFieldsProps {
  state: ChannelFormState;
  setField: <K extends keyof ChannelFormState>(
    key: K,
    value: ChannelFormState[K],
  ) => void;
  isCreate: boolean;
  error: ChannelFormError | null;
}

export function ChannelVkFields({ state, setField, isCreate, error }: ChannelVkFieldsProps) {
  return (
    <>
      <Field
        label="Токен сообщества"
        hint={
          isCreate
            ? 'Настройки сообщества → Работа с API → Ключи доступа → создать ключ с правом «Сообщения сообщества»'
            : 'Оставьте пустым, чтобы не менять'
        }
        error={errorFor(error, 'token')}
      >
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          style={inputStyle}
          maxLength={CHANNEL_LIMITS.token}
          value={state.token}
          onChange={(e) => setField('token', e.target.value)}
        />
      </Field>
      <Field
        label="ID беседы"
        hint="Обычно 2000000000 + номер беседы, куда добавлен бот сообщества"
        error={errorFor(error, 'peerIdText')}
      >
        <input
          type="text"
          inputMode="numeric"
          style={inputStyle}
          value={state.peerIdText}
          onChange={(e) => setField('peerIdText', e.target.value)}
        />
      </Field>
    </>
  );
}
