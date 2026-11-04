// Маршруты страницы канала — `/channels/new` и `/channels/:channelId`
// (ADR-0033). Загрузка, ошибка и «содержимое только после ответа сервера» —
// общий components/LoadedPage.tsx.
import { useParams } from 'react-router-dom';
import { LoadedPage } from '../components/LoadedPage';
import { useGroups } from '../groups/useGroups';
import { ChannelEditorForm } from './ChannelEditorForm';
import { useChannelEditor } from './useChannelEditor';

export default function ChannelEditorScreen() {
  // Адреса два: у `/channels/new` параметра нет вовсе — это новый канал.
  const { channelId } = useParams<{ channelId: string }>();
  const editor = useChannelEditor(channelId);
  // Группы ждём наравне с каналом: радио «Для какой группы» без списка нечем
  // рисовать (ADR-0195); «Обновить» после сбоя форму не прячет.
  const groupsState = useGroups();

  return (
    <LoadedPage
      loading={editor.loading || (groupsState.loading && groupsState.groups === null)}
      error={editor.error}
      onRetry={() => void editor.reload()}
      skeletonWidths={['40%', '90%', '60%']}
    >
      {() => (
        <ChannelEditorForm channel={editor.entity} editor={editor} groups={groupsState} />
      )}
    </LoadedPage>
  );
}
