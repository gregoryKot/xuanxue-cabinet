// Где проходит занятие — одна строка под названием в «Расписании»: адрес
// зала или парка, «Онлайн» или оба сразу. Раньше на карточке стояло только
// слово формата («Офлайн + онлайн»), а самого места не было вовсе, и в
// неделе из трёх парков, зала на Аркави и Zoom нельзя было глазами найти,
// куда идти (отзыв владельца 2026-10-02). Чистая логика — отдельно от
// разметки (CLAUDE.md «Логика вне компонентов»).
import type { ClassFormat } from '@xuanxue/shared';
import { CLASS_FORMAT_LABELS_RU } from './classFormatLabels';

export type SlotPlaceKind = 'venue' | 'online';

export interface SlotPlacePart {
  kind: SlotPlaceKind;
  text: string;
}

// Вторая половина «зал + Zoom» — продолжение первой, строчной: «Аркави 3,
// Тель-Авив · и онлайн», а не два равноправных слова подряд.
const ONLINE_TOO_TEXT = 'и онлайн';

/** Пустой адрес у офлайна — слово формата, а не пустота: учитель ещё не
 * вписал место, но что это не Zoom, видно и так. */
export function slotPlaceParts(format: ClassFormat, location?: string): SlotPlacePart[] {
  const venue: SlotPlacePart = {
    kind: 'venue',
    text: location?.trim() || CLASS_FORMAT_LABELS_RU.offline,
  };
  if (format === 'online')
    return [{ kind: 'online', text: CLASS_FORMAT_LABELS_RU.online }];
  if (format === 'offline') return [venue];
  return [venue, { kind: 'online', text: ONLINE_TOO_TEXT }];
}
