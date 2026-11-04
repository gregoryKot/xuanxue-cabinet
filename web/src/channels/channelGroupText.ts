// Строка групп под каналом в списке (ADR-0195, ADR-0196): «Группы: **Средние,
// Старшие** · 5 занятий» или красное «Группы не выбраны — посты сюда не
// уходят». Канал получает занятия, у которых отмечена хоть одна из его групп.
// Чистая функция без React: ветки «нет групп / группы есть / занятий нет»
// проверяет юнит-тест.
import {
  joinGroupNames,
  type ChannelDto,
  type ClassDto,
  type GroupDto,
} from '@xuanxue/shared';
import { groupClassCountText } from '../school/groupsText';

const NO_GROUP_TEXT = 'Группы не выбраны — посты сюда не уходят';

export interface ChannelGroupLine {
  text: string;
  /** Посты в канал не пойдут — строку рисуем цветом опасности. */
  isWarning: boolean;
}

/** Занятия, которые уйдут в канал: у которых отмечена хоть одна группа канала.
 * Выключенное занятие рассылок не порождает и в счёт не входит. */
function channelClassCount(
  groupIds: readonly string[],
  classes: readonly ClassDto[],
): number {
  return classes.filter(
    (cls) => cls.active && cls.groupIds.some((id) => groupIds.includes(id)),
  ).length;
}

/** `null` — группы канала не нашлись в списке групп (список устарел): строки
 * нет, лучше молчать, чем назвать чужую. */
export function formatChannelGroup(
  channel: Pick<ChannelDto, 'groupIds'>,
  groups: readonly Pick<GroupDto, 'id' | 'name'>[],
  classes: readonly ClassDto[],
): ChannelGroupLine | null {
  if (channel.groupIds.length === 0) return { text: NO_GROUP_TEXT, isWarning: true };
  const known = channel.groupIds.flatMap((id) =>
    groups.filter((group) => group.id === id),
  );
  if (known.length === 0) return null;
  const names = joinGroupNames(known.map((group) => group.name));
  const count = groupClassCountText(channelClassCount(channel.groupIds, classes));
  return { text: `Группы: **${names}** · ${count}`, isWarning: false };
}
