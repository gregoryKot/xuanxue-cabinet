// Тексты раздела «Группы» экрана «Школа» (ADR-0193): чистые функции, чтобы
// проверять склонение и пустую школу без DOM (CLAUDE.md «Продуктовая фича =
// число в своём разделе»: на пустой базе — честное «пока нечего показать»).
import { pluralRu, type PluralForms } from '@xuanxue/shared';

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
