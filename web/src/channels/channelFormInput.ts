// Чистая логика листа канала — состояние, валидация, сборка тела запроса
// (CLAUDE.md «Тесты»), по образцу schedule/classFormInput.ts. Тип канала
// неизменяем после создания (UpdateChannelInput его не принимает) — при
// правке используется `channelDto.type`, поле выбора типа скрыто.
// `token` — write-only (SECURITY §3): при правке пустой, с подсказкой
// «Оставьте пустым, чтобы не менять»; `config` в PATCH не отправляется, если
// токен не ввели. `chatId`/`peerId` секретом не считаются — оба видны в
// `ChannelDto.target`, можно предзаполнить при правке. Токен и ID беседы ВК
// лежат в одном зашифрованном `config` (SECURITY §3) — PATCH заменяет его
// целиком, поэтому поменять только ID беседы без токена нельзя технически;
// форма ловит это понятной ошибкой раньше сервера (ревью п.2), а не 400.
import type {
  ChannelConfig,
  ChannelDto,
  ChannelType,
  CreateChannelInput,
  UpdateChannelInput,
} from '@xuanxue/shared';

/** Тип, который можно выбрать в форме — webpush создаётся своей подпиской,
 * этой форме недоступен (channelTypeLabels.ts, CREATABLE_CHANNEL_TYPES). */
type CreatableChannelType = Exclude<ChannelType, 'webpush'>;

export interface ChannelFormState {
  type: CreatableChannelType;
  title: string;
  chatId: string;
  token: string;
  peerIdText: string;
}

/** `null` — форма валидна; иначе поле с ошибкой (ChannelFormFields рисует её
 * под этим полем, ревью п.7) и текст. */
export interface ChannelFormError {
  field: keyof ChannelFormState;
  message: string;
}

/** Каналу webpush этот экран не даёт открыть свой лист (создаётся подпиской,
 * не формой) — резерв «manual» на случай, если он всё же попал в список. */
function toCreatableType(type: ChannelType): CreatableChannelType {
  return type === 'webpush' ? 'manual' : type;
}

export function initialChannelFormState(channelDto: ChannelDto | null): ChannelFormState {
  return {
    type: channelDto ? toCreatableType(channelDto.type) : 'vk',
    title: channelDto?.title ?? '',
    chatId: channelDto?.type === 'telegram' ? channelDto.target : '',
    token: '',
    peerIdText: channelDto?.type === 'vk' ? channelDto.target : '',
  };
}

function isValidPeerId(text: string): boolean {
  return text.trim() !== '' && Number.isInteger(Number(text));
}

/** `isCreate` — при правке тип берётся из `existing.type`, не из `state.type`
 * (форма его не меняет). `existing.target` — прежний ID беседы ВК: без него
 * нечем поймать попытку поменять ID беседы без токена (ревью п.2). */
export function validateChannelForm(
  state: ChannelFormState,
  isCreate: boolean,
  existing?: Pick<ChannelDto, 'type' | 'target'>,
): ChannelFormError | null {
  if (!state.title.trim()) {
    return { field: 'title', message: 'Впишите название канала.' };
  }
  const type = isCreate ? state.type : toCreatableType(existing?.type ?? state.type);

  if (type === 'telegram' && !state.chatId.trim()) {
    return {
      field: 'chatId',
      message: 'Укажите адрес канала — «@имя_канала» или «-100…» для группы.',
    };
  }
  if (type === 'vk') {
    if (isCreate && !state.token.trim()) {
      return { field: 'token', message: 'Укажите токен сообщества ВК.' };
    }
    if (
      !isCreate &&
      !state.token.trim() &&
      existing &&
      state.peerIdText.trim() !== existing.target
    ) {
      return {
        field: 'peerIdText',
        message: 'Чтобы поменять ID беседы, введите токен заново — ВК хранит их вместе.',
      };
    }
    if (!isValidPeerId(state.peerIdText)) {
      return { field: 'peerIdText', message: 'ID беседы ВК — целое число.' };
    }
  }
  return null;
}

function configFor(state: ChannelFormState, type: CreatableChannelType): ChannelConfig {
  if (type === 'telegram') return { chatId: state.chatId.trim() };
  if (type === 'vk')
    return { token: state.token.trim(), peerId: Number(state.peerIdText) };
  return {};
}

/** Название не режется молча — `maxLength` на инпуте (ChannelFormFields)
 * ограничивает ввод раньше сборки тела запроса (ревью п.15). */
export function toCreateInput(state: ChannelFormState): CreateChannelInput {
  return {
    type: state.type,
    title: state.title.trim(),
    config: configFor(state, state.type),
  };
}

/** `config` отсутствует у ручного канала (полей нет) и у ВК с пустым токеном
 * (учитель не хочет менять секрет) — иначе PATCH стёр бы существующий config
 * пустым объектом или отправил бы наполовину заполненный. */
export function toUpdateInput(
  state: ChannelFormState,
  existingType: ChannelType,
): UpdateChannelInput {
  const input: UpdateChannelInput = { title: state.title.trim() };
  if (existingType === 'telegram') {
    input.config = { chatId: state.chatId.trim() };
  } else if (existingType === 'vk' && state.token.trim()) {
    input.config = { token: state.token.trim(), peerId: Number(state.peerIdText) };
  }
  return input;
}
