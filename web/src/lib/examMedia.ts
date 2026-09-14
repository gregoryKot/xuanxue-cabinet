// Видео экзамена (ADR-0023) — общие форматтеры для экрана сдачи ученика
// (attempt/AttemptMediaPrompt.tsx) и карточки проверки учителя
// (grading/AttemptReviewMedia.tsx): один и тот же ExamMediaDto, два места
// показа — CLAUDE.md «Одна механика — один компонент».
import type { ExamMediaDto } from '@xuanxue/shared';
import { formatDateTime } from './formatDate';

/** «3 мин 40 с» / «45 с» / «2 мин» — длительность видео из Telegram
 * (`durationSec`, целые секунды из самого сообщения бота — ADR-0023,
 * `getFile` не зовём). Не `formatDurationRu` (shared/format-duration.ts):
 * тот форматтер — для шаблонов постов о занятиях, кратен получасу, без
 * секунд и с полным словом «минута/минуты/минут»; здесь произвольная длина
 * ролика и короткая аббревиатура, которая не склоняется. Длительности нет
 * или число не годится (0, отрицательное, NaN из битых данных) — честная
 * пустая строка, не «0 с». */
export function formatExamMediaDuration(durationSec: number | undefined): string {
  if (durationSec === undefined || !Number.isFinite(durationSec) || durationSec <= 0) {
    return '';
  }
  const totalSeconds = Math.round(durationSec);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} с`;
  if (seconds === 0) return `${minutes} мин`;
  return `${minutes} мин ${seconds} с`;
}

/** «Видео получено 12 сентября, 19:30, 3 мин 40 с» — факт получения одной
 * строкой, общий что для ученика, что для учителя: момент и длительность не
 * зависят от того, кто смотрит на экран. `timeZone` — как у `formatDateTime`,
 * нужен только тесту для детерминизма; сами экраны зовут без него — пояс
 * браузера, тот же приём, что у остальных дат кабинета (GradingQueueCard.tsx). */
export function formatExamMediaReceivedAt(
  media: ExamMediaDto,
  timeZone?: string,
): string {
  const when = formatDateTime(media.receivedAt, timeZone);
  const duration = formatExamMediaDuration(media.durationSec);
  return duration ? `Видео получено ${when}, ${duration}` : `Видео получено ${when}`;
}
