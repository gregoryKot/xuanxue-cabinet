// Адреса видео вопроса/варианта (ADR-0133). Своим файлом, а не в apiPaths.ts —
// тот упёрся в файловый храповик (CLAUDE.md «Храповики»).
export const EXAM_VIDEOS_PATH = '/exam-videos';
export const EXAM_VIDEO_STATS_PATH = `${EXAM_VIDEOS_PATH}/stats-summary`;

/** Адрес видео вопроса/варианта (ADR-0133) для `<video src>` — сервер
 * отвечает 302 на подписанную ссылку R2, открывает её сам браузер (тот же
 * приём, что materialFilePath ниже), не apiFetch. */
export function examVideoSrc(videoId: string): string {
  return `/api${EXAM_VIDEOS_PATH}/${videoId}`;
}
