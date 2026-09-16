// Данные страницы канала — `/channels/new` и `/channels/:channelId`
// (страница со своим адресом вместо листа поверх списка, ADR-0033). Механика
// общая с редактором экзамена и вопроса банка (hooks/useEntityEditor.ts),
// здесь только путь коллекции и текст ошибки на языке домена.
import type { ChannelDto, CreateChannelInput, UpdateChannelInput } from '@xuanxue/shared';
import { useEntityEditor, type UseEntityEditorResult } from '../hooks/useEntityEditor';

const CHANNELS_PATH = '/channels';
const LOAD_ERROR_MESSAGE = 'Не удалось открыть канал. Попробуйте ещё раз.';

export type UseChannelEditorResult = UseEntityEditorResult<
  ChannelDto,
  CreateChannelInput,
  UpdateChannelInput
>;

export function useChannelEditor(channelId: string | undefined): UseChannelEditorResult {
  return useEntityEditor(CHANNELS_PATH, channelId, LOAD_ERROR_MESSAGE);
}
