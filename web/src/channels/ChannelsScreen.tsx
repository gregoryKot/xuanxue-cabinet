// «Каналы» — куда уходят посты (docs/PLAN.md §6 п.4). Telegram подключается
// сам через бота, здесь добавляют ВК и ручные каналы (CLAUDE.md «Каждая
// фича объясняет откуда это и зачем»). Правка и создание — отдельная
// страница `/channels/new` и `/channels/:channelId` (ChannelEditorScreen.tsx,
// ADR-0033): отсюда только переход. Облик — направление «Тёплая школа»
// (docs/adr/0043), макет Main.dc.html: заголовок антиквой, весь список — одна
// карточка, строки внутри неё разделены волосяной линией (ChannelCard.tsx).
//
// Переключателей статуса над списком нет: у канала не три состояния, а два
// («включён» видно в самой строке), и каналов у школы единицы — ряд
// переключателей и поиск на таком списке были бы мебелью.
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { ListScreenBody } from '../components/ListScreenBody';
import { oneCardListStyle } from '../components/listCardStyles';
import { primaryActionStyle, screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { ChannelCard } from './ChannelCard';
import { useChannels } from './useChannels';

const TITLE = 'Каналы';
const EXPLANATION =
  'Каналы — куда уходят ссылки и записи. Telegram-группа подключается сама: добавьте бота в группу. ВК и ручные каналы добавьте здесь.';
const EMPTY_MESSAGE = 'Пока нет ни одного канала — добавьте первый.';
const CHANNELS_PATH = '/channels';

export default function ChannelsScreen() {
  const { channels, loading, error, reload } = useChannels();
  const navigate = useNavigate();

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader
        title={TITLE}
        explanation={EXPLANATION}
        action={
          !loading && (
            <Button
              style={primaryActionStyle}
              onClick={() => void navigate(`${CHANNELS_PATH}/new`)}
            >
              Добавить канал
            </Button>
          )
        }
      />

      <ListScreenBody
        items={channels}
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        emptyMessage={EMPTY_MESSAGE}
        listStyle={oneCardListStyle}
        renderItem={(channel, index, all) => (
          <ChannelCard
            key={channel.id}
            channel={channel}
            onSelect={() => void navigate(`${CHANNELS_PATH}/${channel.id}`)}
            isLast={index === all.length - 1}
          />
        )}
      />
    </section>
  );
}
