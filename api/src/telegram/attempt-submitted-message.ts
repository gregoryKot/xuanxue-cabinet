// Текст DM учителю/помощнику «ученик сдал работу» (слой 4.7, PLAN §11) —
// чистая логика, без Mongo и DI (CLAUDE.md «Тесты», образец —
// broadcast-cancel-message.ts). Ссылка на карточку проверки строится от
// `PUBLIC_URL`: без него — сообщение без ссылки, не «undefined» в тексте
// (ADR-0009: ссылки только от PUBLIC_URL, не от заголовка Host).
export function attemptSubmittedMessage(
  studentName: string,
  examTitle: string,
  attemptId: string,
  publicUrl: string | undefined,
): string {
  // «Работа от {имя}», не «{имя} сдал(а)» — глагол прошедшего времени
  // требовал бы знать пол ученика, которого в данных нет (UserLean).
  const base = `Работа от ${studentName} по «${examTitle}» — ждёт вашей проверки.`;
  if (!publicUrl) return base;
  return `${base}\nПроверить: ${publicUrl}/grading/${attemptId}`;
}
