// Строка «куда уходят ссылка и записи» под занятием в «Расписании и рассылках»
// (ADR-0191, ADR-0195, ADR-0196): раньше ответ прятался в «Рассылках», а чинить
// надо было в «Расписании» — два раздела на одно дело. Куда идёт занятие,
// решают только группы: в канал, у которого отмечена хоть одна из них. Строка
// идёт по группам занятия: «→ Средние · Тайцзи онлайн, Старшие · Вечерняя
// группа». Канал с обеими группами назван у каждой — так видно, откуда он
// получает занятие. Группа без канала — красным предупреждением (`warning`)
// рядом с теми, что дойдут. Чистая функция без React: ветки «есть каналы / нет
// групп / у части групп нет канала / ничего ещё не грузится» проверяет юнит-тест.
import type { ChannelDto, ClassDto, GroupDto } from '@xuanxue/shared';

const ARROW_PREFIX = '→ ';
const CHANNEL_SEPARATOR = ', ';
const GROUP_SEPARATOR = ', ';
const NAME_SEPARATOR = ' · ';
const NO_GROUP_TEXT = 'Без группы — никуда не уходит';
const NO_CHANNEL_AT_ALL_TEXT = 'Ни у одной группы занятия нет канала — никуда не уходит';

export interface ClassDestinationLine {
  /** Куда дойдёт («→ Средние · Тайцзи онлайн») или причина, почему никуда. */
  text: string;
  /** Ссылку некому разослать — `text` рисуем цветом опасности. */
  isWarning: boolean;
  /** Часть групп без канала, остальные дойдут: красная строка рядом с `text`. */
  warning?: string;
}

type RoutedClass = Pick<ClassDto, 'groupIds' | 'active' | 'format'>;
type SchoolChannel = Pick<ChannelDto, 'title' | 'groupIds'>;
type NamedGroup = Pick<GroupDto, 'id' | 'name'>;

function quoted(names: readonly string[]): string {
  return names.map((name) => `«${name}»`).join(GROUP_SEPARATOR);
}

function noChannelText(missing: readonly string[]): string {
  return missing.length === 1
    ? `У группы «${missing[0] ?? ''}» нет канала — никуда не уходит`
    : NO_CHANNEL_AT_ALL_TEXT;
}

function partialWarning(missing: readonly string[]): string {
  const subject = missing.length === 1 ? 'У группы' : 'У групп';
  return `${subject} ${quoted(missing)} нет канала — туда не уйдёт`;
}

/** `activeChannels` и `groups` — каналы и группы кабинета, `null` пока грузятся
 * (строки нет вовсе: ложное «никуда не уходит» хуже пустоты). Выключенное
 * занятие рассылок не порождает и не предупреждается; офлайн без Zoom-ссылки
 * слать нечего, так что и ему без каналов предупреждения нет. */
export function formatClassDestination(
  cls: RoutedClass,
  groups: readonly NamedGroup[] | null,
  activeChannels: readonly SchoolChannel[] | null,
): ClassDestinationLine | null {
  if (!activeChannels) return null;
  const mutes = !cls.active || cls.format === 'offline';
  if (cls.groupIds.length === 0) {
    return mutes ? null : { text: NO_GROUP_TEXT, isWarning: true };
  }
  if (!groups) return null;
  const reached: string[] = [];
  const missing: string[] = [];
  for (const id of cls.groupIds) {
    const group = groups.find((candidate) => candidate.id === id);
    if (!group) continue;
    const titles = activeChannels
      .filter((channel) => channel.groupIds.includes(id))
      .map((channel) => channel.title);
    if (titles.length === 0) missing.push(group.name);
    else reached.push(`${group.name}${NAME_SEPARATOR}${titles.join(CHANNEL_SEPARATOR)}`);
  }
  if (reached.length > 0) {
    const text = `${ARROW_PREFIX}${reached.join(GROUP_SEPARATOR)}`;
    if (missing.length === 0 || mutes) return { text, isWarning: false };
    return { text, isWarning: false, warning: partialWarning(missing) };
  }
  if (mutes || missing.length === 0) return null;
  return { text: noChannelText(missing), isWarning: true };
}
