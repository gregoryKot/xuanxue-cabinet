// Поля страницы канала — вынесены из ChannelEditorForm (CLAUDE.md «Файлы»).
// Тип выбирается только при создании (UpdateChannelInput его не принимает);
// при правке — подпись типа как текст, поля зависят от него. Ошибка ловится
// под своим полем (ChannelFormError.field, ревью п.7), не одним общим текстом.
import { CHANNEL_LIMITS } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { Select } from '../components/Select';
import { RichText } from '../components/RichText';
import { GroupRadioField } from '../groups/GroupRadioField';
import type { UseGroupsResult } from '../groups/useGroups';
import type { ChannelFormError, ChannelFormState } from './channelFormInput';
import { CHANNEL_TYPE_LABELS_RU, CREATABLE_CHANNEL_TYPES } from './channelTypeLabels';
import { ChannelVkFields } from './ChannelVkFields';

const GROUP_HINT =
  'Сюда уходят ссылки и записи занятий **одной группы**. Пока группа не выбрана, посты в этот канал не уходят.';

interface ChannelFormFieldsProps {
  state: ChannelFormState;
  setField: <K extends keyof ChannelFormState>(
    key: K,
    value: ChannelFormState[K],
  ) => void;
  error: ChannelFormError | null;
  isCreate: boolean;
  groups: UseGroupsResult;
}

// Своя копия и здесь, и в ChannelVkFields.tsx: общий модуль между двумя
// компонентами формы завёл бы либо цикл импорта, либо третий файл ради
// одной строки — функция короче jscpd-порога (70 токенов), дублировать
// дешевле.
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
  groups,
}: ChannelFormFieldsProps) {
  return (
    <>
      {isCreate ? (
        <Field label="Тип канала">
          <Select
            value={state.type}
            onChange={(e) => setField('type', e.target.value as ChannelFormState['type'])}
          >
            {CREATABLE_CHANNEL_TYPES.map((type) => (
              <option key={type} value={type}>
                {CHANNEL_TYPE_LABELS_RU[type]}
              </option>
            ))}
          </Select>
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

      <GroupRadioField
        legend="Для какой группы"
        noneLabel="Пока никакой"
        groups={groups}
        value={state.groupId}
        onChange={(groupId) => setField('groupId', groupId)}
        hint={
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
            <RichText text={GROUP_HINT} />
          </p>
        }
      />

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
        <ChannelVkFields
          state={state}
          setField={setField}
          isCreate={isCreate}
          error={error}
        />
      )}
    </>
  );
}
