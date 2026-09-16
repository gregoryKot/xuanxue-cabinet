// Поиск по уже загруженному списку (ListFilters.tsx): бэкенд текстового
// поиска не отдаёт («/exams» фильтрует по status/level, «/exam-items» — по
// status/kind/tag), а список и так с лимитом (CLAUDE.md «Списки — всегда с
// лимитом»), поэтому фильтр локальный, без нового запроса на каждую букву.
// Один форматтер на все поля: у формы ищут по названию, у вопроса — по
// формулировке и тегам, и две копии одного сравнения разошлись бы при первой
// правке (CLAUDE.md «Одна механика — один компонент»).
//
// Регистр и пробелы по краям в сравнении не участвуют: «форма» находит
// «Форма и дыхание».
export function matchesSearch(fields: readonly string[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return fields.some((field) => field.toLowerCase().includes(needle));
}
