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
