// Проверка https-ссылки — одна механика на кабинет (CLAUDE.md «Одна механика
// — один компонент»): запись занятия без Telegram-файла
// (planning/recordingFormInput.ts) и видео вопроса без R2
// (exam-items/examVideoFormInput.ts, ADR-0133) — обе принимают только ссылку,
// не файл, и раньше каждая держала свой regexp.
const HTTPS_URL_RE = /^https:\/\//i;

/** `true` — строка (после обрезки пробелов) начинается с `https://`. */
export function isHttpsUrl(value: string): boolean {
  return HTTPS_URL_RE.test(value.trim());
}
