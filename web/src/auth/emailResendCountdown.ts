// Обратный отсчёт до «Отправить ещё раз» на форме входа по почте (аудит
// 2026-10-01, F30). Сервер в окне cooldown отвечает тем же 204, что и на
// настоящую отправку (SECURITY §2 — существование адреса не раскрывается),
// поэтому раньше повторное нажатие молча ничего не слало, а после окна
// сжигало код из первого письма. Честно сказать «подождите N секунд» может
// только форма — по той же цифре, что у сервера (EMAIL_LOGIN_RESEND_COOLDOWN_MIN
// в shared). Чистые функции без React и сети (CLAUDE.md «Тесты»).
import { EMAIL_LOGIN_RESEND_COOLDOWN_MIN } from '@xuanxue/shared';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const COOLDOWN_MS = EMAIL_LOGIN_RESEND_COOLDOWN_MIN * SECONDS_PER_MINUTE * MS_PER_SECOND;

/** Сколько секунд осталось до повторной отправки; 0 — письмо ещё не
 * уходило или окно уже прошло. Округление вверх: «0:01», а не «0:00» с
 * ещё закрытой ссылкой. */
export function resendCooldownSec(sentAtMs: number | null, nowMs: number): number {
  if (sentAtMs === null) return 0;
  const remainingMs = sentAtMs + COOLDOWN_MS - nowMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / MS_PER_SECOND) : 0;
}

/** «1:45», «0:07» — как у отсчёта дедлайна попытки (attempt/attemptDeadline.ts). */
function formatCountdown(sec: number): string {
  const minutes = Math.floor(sec / SECONDS_PER_MINUTE);
  const seconds = sec % SECONDS_PER_MINUTE;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Строка вместо ссылки, пока окно закрыто; акцент на цифре — ADR-0124. */
export function buildResendCountdownText(sec: number): string {
  return `Новое письмо можно запросить через **${formatCountdown(sec)}**.`;
}
