// Строка группы под каналом в списке (ADR-0195): «Группа: **Начинающие** · 5
// занятий» или красное «Группа не выбрана — посты сюда не уходят». Канал
// получает занятия одной группы; в счёт занятий входят и занятия «для всех
// групп» — они уходят в каждый канал, у которого есть группа. Чистая функция
// без React: ветки «нет группы / группа есть / занятий нет» проверяет юнит-тест.
import type { ChannelDto, ClassDto, GroupDto } from '@xuanxue/shared';
import { groupClassCountText } from '../school/groupsText';

const NO_GROUP_TEXT = 'Группа не выбрана — посты сюда не уходят';

export interface ChannelGroupLine {
  text: string;
  /** Посты в канал не пойдут — строку рисуем цветом опасности. */
  isWarning: boolean;
}

/** Занятия, которые уйдут в канал группы: свои и «для всех групп». Выключенное
 * занятие рассылок не порождает и в счёт не входит. */
function channelClassCount(groupId: string, classes: readonly ClassDto[]): number {
  return classes.filter(
    (cls) => cls.active && (cls.forAllGroups || cls.groupId === groupId),
  ).length;
}

/** `null` — группа канала не нашлась в списке групп (список устарел): строки
 * нет, лучше молчать, чем назвать чужую. */
export function formatChannelGroup(
  channel: Pick<ChannelDto, 'groupId'>,
  groups: readonly Pick<GroupDto, 'id' | 'name'>[],
  classes: readonly ClassDto[],
): ChannelGroupLine | null {
  if (channel.groupId === null) return { text: NO_GROUP_TEXT, isWarning: true };
  const group = groups.find((candidate) => candidate.id === channel.groupId);
  if (!group) return null;
  const count = groupClassCountText(channelClassCount(group.id, classes));
  return { text: `Группа: **${group.name}** · ${count}`, isWarning: false };
}
