// Чистые функции для видео вопроса (ADR-0133) — без похода в базу, юнит-тест
// без Mongo (CLAUDE.md «Тесты»). Отдельный файл от exam-item-options.ts:
// тот — про варианты, здесь — про поле videoId/videoUrl самого вопроса
// (файл-лимит размера, CLAUDE.md «Файлы»).
import { ITEM_ONE_VIDEO_SOURCE_MESSAGE } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import { collectOptionVideoIds } from './exam-item-options';
import type { ExamItemOptionRecord, ExamItemVersionRecord } from './exam-item.schema';

/** Видео вопроса — файл (R2) или ссылка, не оба разом (ADR-0133), тем же
 * правилом, что у варианта (assertOptionsForKind/OPTION_ONE_MEDIA_MESSAGE). */
export function assertOneVideoSource(videoId: unknown, videoUrl: unknown): void {
  if (videoId && videoUrl) throw new InvalidInputError(ITEM_ONE_VIDEO_SOURCE_MESSAGE);
}

/** Все videoId вопроса — своё поле (текущее и из history) плюс videoId
 * вариантов (текущих и из history) — тем же приёмом, что imageIds/
 * collectImageIds. Собираются разом, одним запросом к ExamVideosService
 * (CLAUDE.md «API»: не по одному). */
export function collectItemVideoIds(
  videoId: string | undefined,
  options: readonly ExamItemOptionRecord[],
  history: readonly ExamItemVersionRecord[],
): string[] {
  const ids = new Set(collectOptionVideoIds(options, history));
  if (videoId) ids.add(videoId);
  for (const version of history) {
    if (version.videoId) ids.add(version.videoId);
  }
  return [...ids];
}
