// Поля листа канала — вынесены из ChannelSheet (CLAUDE.md «Файлы»). Тип
// выбирается только при создании (UpdateChannelInput его не принимает);
// при правке — подпись типа как текст, поля зависят от него. Ошибка ловится
// под своим полем (ChannelFormError.field, ревью п.7), не одним общим текстом.
import { CHANNEL_LIMITS } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import type { ChannelFormError, ChannelFormState } from './channelFormInput';
import { CHANNEL_TYPE_LABELS_RU, CREATABLE_CHANNEL_TYPES } from './channelTypeLabels';

interface ChannelFormFieldsProps {
  state: ChannelFormState;
  setField: <K extends keyof ChannelFormState>(
    key: K,
    value: ChannelFormState[K],
  ) => void;
  error: ChannelFormError | null;
  isCreate: boolean;
}

function errorFor(
  error: ChannelFormError | null,
  field: keyof ChannelFormState,
): string | undefined {
  return error?.field === field ? error.message : undefined;
}

export function ChannelFormFields({
  state,
  setField,
  error,
  isCreate,
}: ChannelFormFieldsProps) {
  return (
    <>
      {isCreate ? (
        <Field label="Тип канала">
          <select
            style={inputStyle}
            value={state.type}
            onChange={(e) => setField('type', e.target.value as ChannelFormState['type'])}
          >
            {CREATABLE_CHANNEL_TYPES.map((type) => (
              <option key={type} value={type}>
                {CHANNEL_TYPE_LABELS_RU[type]}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
          Тип: {CHANNEL_TYPE_LABELS_RU[state.type]}
        </p>
      )}

      <Field label="Название" error={errorFor(error, 'title')}>
        <input
          style={inputStyle}
          maxLength={CHANNEL_LIMITS.title}
          value={state.title}
          onChange={(e) => setField('title', e.target.value)}
        />
      </Field>

      {state.type === 'telegram' && (
        <Field
          label="Адрес канала или группы"
          hint="«@имя_канала» или «-100…» для группы — сначала добавьте бота администратором"
          error={errorFor(error, 'chatId')}
        >
          <input
            style={inputStyle}
            maxLength={CHANNEL_LIMITS.chatId}
            value={state.chatId}
            onChange={(e) => setField('chatId', e.target.value)}
          />
        </Field>
      )}

      {state.type === 'vk' && (
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
      )}
    </>
  );
}
