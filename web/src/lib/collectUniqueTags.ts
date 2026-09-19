// Уникальные теги по списку записей — общий источник для подсказки тега
// (useMaterialTagOptions.ts, даталист формы материала) и пилюль фильтра
// библиотеки, у учителя и у ученика (ADR-0058: справочника тегов нет, набор
// пилюль собирается из уже заведённых). Порядок — по первому появлению тега
// в списке, без учёта регистра дубли уже снял `normalizeTags` при записи, но
// сам список DTO может прислать значения из разных материалов — эта функция
// схлопывает их ещё раз, чтобы одна и та же строка не занимала две пилюли.
export function collectUniqueTags<T extends { tags: readonly string[] }>(
  items: readonly T[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    for (const tag of item.tags) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      result.push(tag);
    }
  }
  return result;
}
