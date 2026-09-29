// Данные страницы канала — `/channels/new` и `/channels/:channelId`
// (страница со своим адресом вместо листа поверх списка, ADR-0033). Механика
// общая с редактором экзамена и вопроса (hooks/useEntityEditor.ts),
// здесь только коллекция и текст ошибки на языке домена.
import { CHANNELS_PATH } from '../api/apiPaths';
import { useEntityEditor, type EntityEditorOf } from '../hooks/useEntityEditor';

const LOAD_ERROR_MESSAGE = 'Не удалось открыть канал. Попробуйте ещё раз.';

export type UseChannelEditorResult = EntityEditorOf<typeof CHANNELS_PATH>;

export function useChannelEditor(channelId: string | undefined): UseChannelEditorResult {
  return useEntityEditor(CHANNELS_PATH, channelId, LOAD_ERROR_MESSAGE);
}
