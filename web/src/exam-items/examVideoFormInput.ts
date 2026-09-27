// Чистая логика ссылки на видео вопроса/варианта без R2 (ADR-0133) — юнит-тест
// без DOM (CLAUDE.md «Тесты»). Проверка https — общая (lib/httpsUrl.ts), не
// свой regexp: тот же приём нужен уже planning/recordingFormInput.ts.
import {
  EXAM_VIDEO_LIMITS,
  ITEM_ONE_VIDEO_SOURCE_MESSAGE,
  OPTION_ONE_MEDIA_MESSAGE,
} from '@xuanxue/shared';
import { isHttpsUrl } from '../lib/httpsUrl';

/** Видео вопроса/варианта — файл в R2 (`videoId`) или ссылка (`videoUrl`),
 * не оба разом (ADR-0133); ни одного — пусто. Общий тип для useVideoAttach
 * (CLAUDE.md «Одна механика — один компонент»): и вопрос, и вариант несут
 * одну и ту же пару полей. */
export interface ExamVideoValue {
  videoId?: string;
  videoUrl?: string;
}

/** `null` — ссылка валидна, иначе текст ошибки по VOICE. */
export function validateExamVideoUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return 'Укажите ссылку на видео.';
  if (!isHttpsUrl(trimmed)) return 'Ссылка должна начинаться с https://.';
  if (trimmed.length > EXAM_VIDEO_LIMITS.videoUrl) {
    return `Ссылка длиннее ${EXAM_VIDEO_LIMITS.videoUrl} символов.`;
  }
  return null;
}

interface VideoMediaState extends ExamVideoValue {
  options: (ExamVideoValue & { imageId?: string })[];
}

/** Правила медиа вопроса тем же текстом, что у сервиса (assertOptionsForKind,
 * ADR-0133): у вопроса видео одним способом — файлом или ссылкой; у варианта
 * одно медиа — картинка или видео, и видео тоже одним способом. `null` — всё
 * в порядке. */
export function validateExamVideoMedia(state: VideoMediaState): string | null {
  if (state.videoId && state.videoUrl) return ITEM_ONE_VIDEO_SOURCE_MESSAGE;
  const hasTwoMedia = state.options.some(
    (option) =>
      (Boolean(option.imageId) && Boolean(option.videoId || option.videoUrl)) ||
      Boolean(option.videoId && option.videoUrl),
  );
  return hasTwoMedia ? OPTION_ONE_MEDIA_MESSAGE : null;
}
