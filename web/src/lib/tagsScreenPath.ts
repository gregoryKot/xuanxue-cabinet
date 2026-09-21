// Адрес экрана тега (/materials/tags?tag=, ADR-0075/0078) — общая функция
// для пилюли на MaterialCard.tsx и planning/LessonCard.tsx (components/
// TagPillLinks.tsx) и для перехода со списка материалов
// (materials/MaterialsScreen.tsx): без неё одна и та же сборка
// encodeURIComponent разъехалась бы по нескольким файлам (CLAUDE.md «Без
// магических чисел и строк»). Тег — query-параметр, не сегмент пути: тег —
// свободный текст и может содержать «/» (ADR-0078, docs/adr/0075).
//
// Не экспортирован: адрес самого маршрута отдельно объявлен литералом в
// routeModules.ts (тот же приём, что у всех остальных путей таблицы) —
// второй экспорт этой же строки только ради него knip поймал бы как
// неиспользуемый.
const MATERIALS_TAGS_PATH = '/materials/tags';

/** Без тега — сам список тегов школы; с тегом — тот же экран с выбранным
 * тегом (`useSearchParams` в MaterialsTagsScreen.tsx читает его обратно). */
export function tagsScreenPath(tag?: string): string {
  return tag
    ? `${MATERIALS_TAGS_PATH}?tag=${encodeURIComponent(tag)}`
    : MATERIALS_TAGS_PATH;
}
