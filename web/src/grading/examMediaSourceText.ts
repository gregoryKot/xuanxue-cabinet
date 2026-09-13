// Что означает способ получения видео учителю (ADR-0023) — куда идти
// смотреть или что уже сделано. `kind: 'link'` в этот текст не попадает:
// ссылка рисуется отдельно, кликабельной строкой (AttemptReviewMedia.tsx),
// а не пересказывается текстом — открыть её самим быстрее, чем прочитать
// абзац о том, что она есть.
import type { ExamMediaDto } from '@xuanxue/shared';

export function describeMediaSource(media: ExamMediaDto): string {
  if (media.kind === 'telegram') {
    return 'Переслано боту в Telegram. Видео смотрите там же.';
  }
  if (media.kind === 'manual') {
    return media.note
      ? `Отмечено вручную: ${media.note}`
      : 'Отмечено вручную, без подписи.';
  }
  return '';
}
