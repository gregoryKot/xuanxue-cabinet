// Подпись числа каналов рассылки на карточке слота (docs/PLAN.md §6 п.1,
// ревью п.1) — 0 каналов не «0 каналов», а понятное «без каналов».
import { pluralRu } from '@xuanxue/shared';

const CHANNEL_WORD_FORMS = {
  one: 'канал',
  few: 'канала',
  many: 'каналов',
  other: 'канала',
};

export function formatChannelCount(count: number): string {
  if (count === 0) return 'без каналов';
  return `${count} ${pluralRu(count, CHANNEL_WORD_FORMS)}`;
}

/** Занятие хранит channelIds выключенных и удалённых каналов (учитель мог
 * выключить канал на экране «Каналы», занятие об этом не узнаёт) — карточка
 * слота считает только те, что реально получат рассылку, иначе «2 канала»
 * на слоте с одним выключенным вводит в заблуждение. */
export function countActiveChannels(
  channelIds: string[],
  activeChannelIds: ReadonlySet<string>,
): number {
  return channelIds.filter((id) => activeChannelIds.has(id)).length;
}
