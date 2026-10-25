// Есть ли у занятия ссылка на подключение — своя разовая (zoomLinkOverride)
// или ссылка класса. Одно правило на два места (CLAUDE.md «Одна механика —
// один компонент»): планировщик рассылок без ссылки пост не шлёт
// (broadcast-planner.decide.ts), а бот без ссылки не спрашивает «Запись?»
// (recording-prompt.service.ts) — занятие шло вживую, записи с него не
// бывает (владелец, 2026-10-06: «присылай запрос на запись только там, где
// ссылка была»). Поля зашифрованы в базе (LESSON_FIELD_POLICY,
// CLASS_FIELD_POLICY) — здесь проверяется только наличие, расшифровка не
// нужна.
export function hasLessonLink(
  lesson: { zoomLinkOverride?: string },
  cls: { zoomLink?: string },
): boolean {
  return Boolean(lesson.zoomLinkOverride ?? cls.zoomLink);
}
