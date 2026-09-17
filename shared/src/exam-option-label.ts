// Подпись варианта ответа без своего текста (ADR-0035): у варианта-картинки
// текст не обязателен, а подпись нужна везде, где вариант называют словами —
// в кабинете (AttemptQuestionChoice.tsx, AttemptReviewQuestion.tsx,
// examItemStatsText.ts) и на кнопке бота (api/src/telegram/handlers/
// exam-question-screen.ts: Telegram отклоняет кнопку с пустым текстом). Один
// источник, чтобы «Вариант N» на экране сдачи, в проверке и в боте совпадал
// (CLAUDE.md «Одна механика — один компонент»). Отдельный файл, не exams.ts:
// тот уже за потолком файлового храповика.
export function formatOptionLabel(text: string, index: number): string {
  return text || `Вариант ${index + 1}`;
}
