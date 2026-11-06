// Сколько занятий из правил недели не дойдут до учеников (ADR-0198).
// Предупреждения «никуда не уходит» нарисованы у каждого занятия на подэкране
// «Правила недели», а смотрят на главный экран «Расписание»: без одной строки
// там отказ остался бы тихим — самая дорогая ошибка в продукте про рассылки.
// Чистые функции без React: ветки «грузится / всё доходит / часть групп без
// канала» проверяет юнит-тест.
import { pluralRu, type ChannelDto, type ClassDto, type GroupDto } from '@xuanxue/shared';
import { formatClassDestination } from './classDestinationText';

/** `null`, пока классы, группы или каналы грузятся: ложное «не дойдёт» хуже
 * пустоты. Считается то же, что красит строка занятия: предупреждение целиком
 * или «часть групп без канала». */
export function countUndeliveredClasses(
  classes: readonly ClassDto[] | null,
  groups: readonly GroupDto[] | null,
  activeChannels: readonly ChannelDto[] | null,
): number | null {
  if (!classes || !groups || !activeChannels) return null;
  return classes.filter((cls) => {
    const line = formatClassDestination(cls, groups, activeChannels);
    return line !== null && (line.isWarning || Boolean(line.warning));
  }).length;
}

/** Строка для главного экрана; `null` — сказать нечего (грузится или всё доходит). */
export function undeliveredNotice(count: number | null): string | null {
  if (count === null || count === 0) return null;
  const noun = pluralRu(count, {
    one: 'занятия',
    few: 'занятий',
    many: 'занятий',
    other: 'занятий',
  });
  return `У **${count} ${noun}** из правил недели ссылка дойдёт не до всех групп.`;
}
