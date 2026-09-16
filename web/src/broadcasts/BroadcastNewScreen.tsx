// Маршрут страницы «Новая рассылка» — `/broadcasts/new` (ADR-0033: свой
// адрес вместо листа поверх журнала). Каналы грузятся здесь, а не в форме:
// выбирать не из чего, пока список не пришёл, и форма не должна собираться
// на пустом списке (LoadedPage отдаёт содержимое только после ответа).
//
// Только активные каналы: в выключенный рассылка не уйдёт, сервер откажет
// (BroadcastsService.createManual).
import { LoadedPage } from '../components/LoadedPage';
import { useChannels } from '../channels/useChannels';
import { BroadcastNewForm } from './BroadcastNewForm';

export default function BroadcastNewScreen() {
  const { channels, loading, error, reload } = useChannels(true);

  return (
    <LoadedPage
      loading={loading}
      error={error}
      onRetry={() => void reload()}
      skeletonWidths={['40%', '90%', '60%']}
    >
      {() => <BroadcastNewForm channels={channels ?? []} />}
    </LoadedPage>
  );
}
