// Какие занятия кормят канал — текст строки в списке каналов и подписи
// галочек на странице канала. Чистые функции без React: «все / несколько /
// ни одного / занятий нет» — ветвления, которые проверяет юнит-тест.
//
// Считаются только включённые занятия: выключенное занятие рассылок не
// порождает (в «Расписании» оно помечено «выключено», SlotRow.tsx), так что
// «привязано» к нему — не «сюда уходят посты». На странице канала выключенное
// занятие остаётся в списке с пометкой — отметку с него можно снять.
import { pluralRu, WEEKDAY_LABELS_RU, type ClassDto } from '@xuanxue/shared';

const CLASSES_FORMS = {
  one: 'занятие',
  few: 'занятия',
  many: 'занятий',
  other: 'занятия',
} as const;
const ALL_CLASSES_TEXT = '**Все занятия**';
const NO_CLASSES_AT_ALL_TEXT = 'Занятий в расписании пока нет.';
const NONE_LINKED_TEXT = 'Ни одного занятия — посты сюда не уходят';
const DISABLED_SUFFIX = ' (выключено)';
// Больше трёх названий в одной строке списка читаются сплошной лентой.
const MAX_LISTED = 3;

export interface ChannelClassesLine {
  text: string;
  /** Посты в канал не пойдут — строку рисуем цветом опасности. */
  isWarning: boolean;
}

/** «Тайцзи вт 19:00» — название и первое правило расписания. Занятие без
 * правил (ещё не настроено) — одно название. */
export function formatClassLabel(cls: ClassDto): string {
  const rule = cls.rules[0];
  if (!rule) return cls.title;
  return `${cls.title} ${WEEKDAY_LABELS_RU[rule.weekday].toLowerCase()} ${rule.time}`;
}

/** Подпись галочки на странице канала: выключенное занятие помечено. */
export function formatClassOptionLabel(cls: ClassDto): string {
  return cls.active
    ? formatClassLabel(cls)
    : `${formatClassLabel(cls)}${DISABLED_SUFFIX}`;
}

export function formatChannelClasses(
  channelId: string,
  classes: readonly ClassDto[],
): ChannelClassesLine {
  const active = classes.filter((cls) => cls.active);
  if (classes.length === 0) return { text: NO_CLASSES_AT_ALL_TEXT, isWarning: false };

  const linked = active.filter((cls) => cls.channelIds.includes(channelId));
  if (linked.length === 0) return { text: NONE_LINKED_TEXT, isWarning: true };
  if (linked.length === active.length && active.length > 1) {
    return { text: ALL_CLASSES_TEXT, isWarning: false };
  }

  const count = `**${linked.length} ${pluralRu(linked.length, CLASSES_FORMS)}**`;
  const labels = linked.slice(0, MAX_LISTED).map(formatClassLabel).join(', ');
  const rest = linked.length - MAX_LISTED;
  const more = rest > 0 ? ` и ещё ${rest}` : '';
  return { text: `${count}: ${labels}${more}`, isWarning: false };
}
