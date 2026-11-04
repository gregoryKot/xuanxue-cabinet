// Строка «куда уходят ссылка и записи» под занятием в «Расписании и рассылках»
// (ADR-0191): раньше ответ прятался в «Рассылках», а чинить надо было в
// «Расписании» — два раздела на одно дело. Чистая функция без React: ветки
// «есть каналы / нет каналов / выключено / каналы ещё грузятся» проверяет
// юнит-тест.
import type { ChannelDto, ClassDto } from '@xuanxue/shared';

const ARROW_PREFIX = '→ ';
const CHANNEL_SEPARATOR = ', ';
const NOWHERE_TEXT = 'Никуда не уходит — выберите канал';

export interface ClassDestinationLine {
  text: string;
  /** Ссылку некому разослать — строку рисуем цветом опасности. */
  isWarning: boolean;
}

type ActiveChannel = Pick<ChannelDto, 'id' | 'title'>;

/** `activeChannels` — только включённые каналы кабинета, `null` пока грузятся
 * (строки нет вовсе: ложное «никуда не уходит» хуже пустоты). Канал, который
 * выключили или удалили, в channelIds занятия остаётся — по нему рассылка не
 * пойдёт, поэтому в строку он не попадает. Выключенное занятие рассылок не
 * порождает и не предупреждается; офлайн без Zoom-ссылки слать нечего, так
 * что и ему без каналов предупреждения нет. */
export function formatClassDestination(
  cls: Pick<ClassDto, 'channelIds' | 'active' | 'format'>,
  activeChannels: readonly ActiveChannel[] | null,
): ClassDestinationLine | null {
  if (!activeChannels) return null;
  const titleById = new Map(activeChannels.map((channel) => [channel.id, channel.title]));
  const titles = cls.channelIds.flatMap((id) => titleById.get(id) ?? []);
  if (titles.length > 0) {
    return { text: `${ARROW_PREFIX}${titles.join(CHANNEL_SEPARATOR)}`, isWarning: false };
  }
  if (!cls.active || cls.format === 'offline') return null;
  return { text: NOWHERE_TEXT, isWarning: true };
}
