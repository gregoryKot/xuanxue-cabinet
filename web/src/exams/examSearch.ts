// Поиск по названию формы в уже загруженном списке (ExamFilters.tsx) —
// бэкенд текстовый поиск по title не отдаёт (`/exams` фильтрует только
// status/level), список и так лимитирован (CLAUDE.md «Списки — всегда с
// лимитом»), поэтому фильтр — локальный, без нового запроса. Регистр и
// пробелы по краям не участвуют в сравнении: «форма» находит «Форма и
// дыхание».
export function matchesExamSearch(title: string, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return true;
  return title.toLowerCase().includes(trimmed);
}
