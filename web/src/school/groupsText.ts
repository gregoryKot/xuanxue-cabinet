// Тексты раздела «Группы» экрана «Школа» (ADR-0193, ADR-0195): чистые функции, чтобы
// проверять склонение и пустую школу без DOM (CLAUDE.md «Продуктовая фича =
// число в своём разделе»: на пустой базе — честное «пока нечего показать»).
import { pluralRu, type GroupDto, type PluralForms } from '@xuanxue/shared';

const CLASS_FORMS: PluralForms = {
  one: 'занятие',
  few: 'занятия',
  many: 'занятий',
  other: 'занятия',
};

/** Сколько занятий идёт группе: «3 занятия» или «Занятий нет». */
export function groupClassCountText(classCount: number): string {
  if (classCount === 0) return 'Занятий нет';
  return `${classCount} ${pluralRu(classCount, CLASS_FORMS)}`;
}

/** Число раздела для шапки: «Групп: **3**» или «Групп пока нет». */
export function groupsSummaryText(groupCount: number): string {
  if (groupCount === 0) return 'Групп пока нет';
  return `Групп: **${groupCount}**`;
}

const NO_CHANNEL_TEXT = 'канала нет';
const META_SEPARATOR = ' · ';

/** Вторая строка группы: «5 занятий · каналы: Тайцзи вечер» или «Занятий нет ·
 * канала нет». Названия каналов — из списка каналов; пока он не пришёл (или не
 * загрузился), честно пишем число из самой группы, а не «канала нет». */
export function groupMetaText(
  group: Pick<GroupDto, 'classCount' | 'channelCount'>,
  channelTitles: readonly string[] | null,
): string {
  const classes = groupClassCountText(group.classCount);
  if (channelTitles === null) {
    return group.channelCount === 0
      ? [classes, NO_CHANNEL_TEXT].join(META_SEPARATOR)
      : `${classes}${META_SEPARATOR}каналов: ${group.channelCount}`;
  }
  if (channelTitles.length === 0) return [classes, NO_CHANNEL_TEXT].join(META_SEPARATOR);
  return `${classes}${META_SEPARATOR}каналы: ${channelTitles.join(', ')}`;
}

/** Почему группу нельзя удалить — учителю надо знать, где её снять. Пустая
 * строка — удалять можно. */
export function groupBlockedText(
  group: Pick<GroupDto, 'classCount' | 'channelCount'>,
): string {
  const { classCount, channelCount } = group;
  if (classCount > 0 && channelCount > 0) return 'Удалить нельзя: есть занятия и каналы';
  if (classCount > 0) return 'Удалить нельзя: есть занятия';
  if (channelCount > 0) return 'Удалить нельзя: есть каналы';
  return '';
}
