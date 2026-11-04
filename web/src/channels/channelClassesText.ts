// Какие занятия кормят канал — текст строки в списке каналов.
// Чистая функция без React: «все / несколько / ни одного / занятий нет» —
// ветвления, которые проверяет юнит-тест.
//
// Считаются курсы (groupClassesByCourse.ts), а не слоты расписания: тот же
// счёт, что в списке галочек на странице канала, иначе два экрана расходятся.
// Выключенное занятие рассылок не порождает и в счёт не входит.
import { pluralRu, type ClassDto } from '@xuanxue/shared';
import { groupClassesByCourse } from './groupClassesByCourse';

const COURSES_FORMS = {
  one: 'курс',
  few: 'курса',
  many: 'курсов',
  other: 'курса',
} as const;
const ALL_CLASSES_TEXT = '**Все занятия**';
const NO_CLASSES_AT_ALL_TEXT = 'Занятий в расписании пока нет.';
const NONE_LINKED_TEXT = 'Ни одного занятия — посты сюда не уходят';
// Больше трёх названий в одной строке списка читаются сплошной лентой.
const MAX_LISTED = 3;

export interface ChannelClassesLine {
  text: string;
  /** Посты в канал не пойдут — строку рисуем цветом опасности. */
  isWarning: boolean;
}

export function formatChannelClasses(
  channelId: string,
  classes: readonly ClassDto[],
): ChannelClassesLine {
  if (classes.length === 0) return { text: NO_CLASSES_AT_ALL_TEXT, isWarning: false };

  const rows = groupClassesByCourse(classes, channelId);
  // Курс, привязанный частью слотов, всё равно шлёт посты — считаем его.
  const linked = rows.filter((row) => row.state !== 'none');
  if (linked.length === 0) return { text: NONE_LINKED_TEXT, isWarning: true };
  if (rows.every((row) => row.state === 'all') && rows.length > 1) {
    return { text: ALL_CLASSES_TEXT, isWarning: false };
  }

  const count = `**${linked.length} ${pluralRu(linked.length, COURSES_FORMS)}**`;
  const names = linked
    .slice(0, MAX_LISTED)
    .map((row) => row.name)
    .join(', ');
  const rest = linked.length - MAX_LISTED;
  const more = rest > 0 ? ` и ещё ${rest}` : '';
  return { text: `${count}: ${names}${more}`, isWarning: false };
}
