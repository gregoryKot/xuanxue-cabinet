// Поля страницы канала — вынесены из ChannelEditorForm (CLAUDE.md «Файлы»).
// Тип выбирается только при создании (UpdateChannelInput его не принимает);
// при правке — подпись типа как текст, поля зависят от него. Ошибка ловится
// под своим полем (ChannelFormError.field, ревью п.7), не одним общим текстом.
import { CHANNEL_LIMITS, TAG_LIMITS } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { Select } from '../components/Select';
import { TagsField } from '../components/TagsField';
import { Toggle } from '../components/Toggle';
import { useTagOptions } from '../hooks/useTagOptions';
import type { ChannelFormError, ChannelFormState } from './channelFormInput';
import { CHANNEL_TYPE_LABELS_RU, CREATABLE_CHANNEL_TYPES } from './channelTypeLabels';
import { ChannelVkFields } from './ChannelVkFields';

// Механика тегов объясняется до первого действия (CLAUDE.md «Каждая фича
// объясняет откуда и зачем») — без этой строки учитель узнал бы про фильтр
// только после того, как рассылка перестала бы доходить до части учеников.
const TAGS_HINT =
  `Пусто — в канал уходит всё по его занятиям. Впишите теги через запятую — ` +
  `останутся только занятия с этими тегами: своими или тегами занятия в ` +
  `расписании. До ${TAG_LIMITS.perRecord}.`;

interface ChannelFormFieldsProps {
  state: ChannelFormState;
  setField: <K extends keyof ChannelFormState>(
    key: K,
    value: ChannelFormState[K],
  ) => void;
  error: ChannelFormError | null;
  isCreate: boolean;
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
}: ChannelFormFieldsProps) {
  // Сбой useTagOptions.ts просто оставляет список пустым — без подсказок,
  // но поле работает как обычный текстовый ввод.
  const tagOptions = useTagOptions();

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

      {/* Новый канал включён с рождения — `CreateChannelInput` поля `active`
          не принимает, выключать нечего до первого сохранения. */}
      {!isCreate && (
        <Toggle
          label="Включён"
          hint="Выключенный канал остаётся в списке, но рассылки в него не уходят."
          checked={state.active}
          onChange={(active) => setField('active', active)}
        />
      )}

      <Field label="Название" error={errorFor(error, 'title')}>
        <input
          style={inputStyle}
          maxLength={CHANNEL_LIMITS.title}
          value={state.title}
          onChange={(e) => setField('title', e.target.value)}
        />
      </Field>

      <TagsField
        value={state.tagsText}
        onChange={(value) => setField('tagsText', value)}
        hint={TAGS_HINT}
        options={tagOptions}
        error={errorFor(error, 'tagsText')}
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
