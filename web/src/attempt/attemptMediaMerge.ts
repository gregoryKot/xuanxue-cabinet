// Правка `media` попытки ответом записи, без второго GET (ADR-0087,
// ADR-0137) — чистая функция, юнит-тест без DOM. `POST .../complete`
// возвращает готовый `ExamMediaDto`, useAnswerVideoUpload.ts кладёт его сюда
// через `applyMedia` (useAttempt.ts), а не через `await reload()`
// (check-write-then-reload.mjs).
import type { ExamMediaDto } from '@xuanxue/shared';

/** Новая запись файла заменяет прежний файл ТОГО ЖЕ вопроса (ADR-0137,
 * тем же правилом, что у ссылки — ADR-0086): загрузка другого видео к уже
 * отвеченному вопросу не плодит вторую запись `kind: 'file'`. Ссылки и
 * видео из Telegram того же вопроса не трогает — это разные пути ответа. */
export function mergeAnswerVideoMedia(
  media: ExamMediaDto[],
  next: ExamMediaDto,
): ExamMediaDto[] {
  const withoutSameFile = media.filter(
    (item) => !(item.itemId === next.itemId && item.kind === 'file'),
  );
  return [...withoutSameFile, next];
}
