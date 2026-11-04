// Строка «куда уходят ссылка и записи» под занятием в «Расписании и рассылках»
// (ADR-0191, ADR-0195): раньше ответ прятался в «Рассылках», а чинить надо
// было в «Расписании» — два раздела на одно дело. Куда идёт занятие, решает
// только группа: каналы той же группы; у занятия «для всех групп» — все каналы,
// у которых группа есть. Чистая функция без React: ветки «есть каналы / нет
// группы / у группы нет канала / каналы ещё грузятся» проверяет юнит-тест.
import type { ChannelDto, ClassDto } from '@xuanxue/shared';

const ARROW_PREFIX = '→ ';
const ALL_GROUPS_PREFIX = 'все каналы с группой: ';
const CHANNEL_SEPARATOR = ', ';
const NO_GROUP_TEXT = 'Без группы — никуда не уходит';
const NO_GROUPED_CHANNEL_TEXT = 'Ни у одного канала нет группы — никуда не уходит';

export interface ClassDestinationLine {
  text: string;
  /** Ссылку некому разослать — строку рисуем цветом опасности. */
  isWarning: boolean;
}

type RoutedClass = Pick<
  ClassDto,
  'groupId' | 'forAllGroups' | 'groupLabel' | 'active' | 'format'
>;
type SchoolChannel = Pick<ChannelDto, 'title' | 'groupId'>;

function noChannelText(cls: RoutedClass): string {
  if (cls.forAllGroups) return NO_GROUPED_CHANNEL_TEXT;
  if (!cls.groupId) return NO_GROUP_TEXT;
  return `У группы «${cls.groupLabel}» нет канала — никуда не уходит`;
}

/** `activeChannels` — каналы кабинета, `null` пока грузятся
 * (строки нет вовсе: ложное «никуда не уходит» хуже пустоты). Канал без группы
 * рассылку не получит, поэтому в строку не попадает. Выключенное занятие
 * рассылок не порождает и не предупреждается; офлайн без Zoom-ссылки слать
 * нечего, так что и ему без каналов предупреждения нет. */
export function formatClassDestination(
  cls: RoutedClass,
  activeChannels: readonly SchoolChannel[] | null,
): ClassDestinationLine | null {
  if (!activeChannels) return null;
  const reached = activeChannels.filter((channel) =>
    cls.forAllGroups
      ? channel.groupId !== null
      : cls.groupId && channel.groupId === cls.groupId,
  );
  if (reached.length > 0) {
    const titles = reached.map((channel) => channel.title).join(CHANNEL_SEPARATOR);
    const prefix = cls.forAllGroups ? ALL_GROUPS_PREFIX : '';
    return { text: `${ARROW_PREFIX}${prefix}${titles}`, isWarning: false };
  }
  if (!cls.active || cls.format === 'offline') return null;
  return { text: noChannelText(cls), isWarning: true };
}
