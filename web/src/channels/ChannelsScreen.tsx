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
import type { ChannelDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { ListScreenBody } from '../components/ListScreenBody';
import { oneCardListStyle } from '../components/listCardStyles';
import { primaryActionStyle, screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { useGroups } from '../groups/useGroups';
import { useClasses } from '../schedule/useClasses';
import { ChannelCard } from './ChannelCard';
import { formatChannelGroup } from './channelGroupText';
import { useChannels } from './useChannels';

const TITLE = 'Каналы';
const EXPLANATION =
  'Каналы — куда уходят ссылки и записи. **Telegram подключается сам**, ВК и ручные каналы добавьте здесь. Канал получает занятия **отмеченных групп** — отметьте их на странице канала.';
const EMPTY_MESSAGE = 'Пока нет ни одного канала — добавьте первый.';
const CHANNELS_PATH = '/channels';

export default function ChannelsScreen() {
  const { channels, loading, error, reload } = useChannels();
  // Какая группа кормит канал и сколько у неё занятий, видно в строке
  // (отзыв владельца 2026-11-03, ADR-0195). Сбой загрузки групп или занятий
  // строку прячет, а не врёт «группа не выбрана».
  const classesState = useClasses();
  const groupsState = useGroups();
  const groupLineFor = (channel: ChannelDto) => {
    if (classesState.error || groupsState.error) return undefined;
    if (classesState.classes === null || groupsState.groups === null) return null;
    return (
      formatChannelGroup(channel, groupsState.groups, classesState.classes) ?? undefined
    );
  };
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
            groupLine={groupLineFor(channel)}
          />
        )}
      />
    </section>
  );
}
