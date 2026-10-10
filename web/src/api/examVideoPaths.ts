// Адреса видео вопроса/варианта (ADR-0133). Своим файлом, а не в apiPaths.ts —
// тот упёрся в файловый храповик (CLAUDE.md «Храповики»).
import { VIDEO_DOWNLOAD_QUERY_PARAM, VIDEO_DOWNLOAD_QUERY_VALUE } from '@xuanxue/shared';

/** Адрес видео вопроса/варианта (ADR-0133) для `<video src>` — сервер
 * отвечает 302 на подписанную ссылку R2, открывает её сам браузер (тот же
 * приём, что materialFilePath ниже), не apiFetch. */
export function examVideoSrc(videoId: string): string {
  return `/api/exam-videos/${videoId}`;
}

/** Адрес видео-ответа ученика (ADR-0137), тем же приёмом — `<video src>`,
 * сервер отвечает 302 на подписанную ссылку R2. Запросы самой загрузки
 * (старт, части, complete, stats) идут по карте маршрутов
 * (shared/src/answer-videos-routes.ts); здесь остаётся только адрес готового
 * плеера, раз ExamVideoPlayer.tsx уже импортирует отсюда examVideoSrc для
 * соседнего случая. */
export function answerVideoSrc(answerVideoId: string): string {
  return `/api/answer-videos/${answerVideoId}`;
}

/** Адрес записи занятия, загруженной файлом (ADR-0180), тем же приёмом: 302 на
 * подписанную ссылку R2 для `<video src>`, кадр-превью — `…/poster`. */
export function lessonVideoSrc(videoId: string): string {
  return `/api/lesson-videos/${videoId}`;
}

/** Ссылка «Скачать» к адресу видео (`examVideoSrc`/`answerVideoSrc`): тот же
 * 302, но подписанная ссылка R2 несёт `Content-Disposition: attachment`
 * (ADR-0165), и браузер сохраняет файл, а не открывает его. Обычная `<a href>`,
 * не `fetch`: редирект уходит на другой домен, а CSP не пускает такой `fetch`. */
export function videoDownloadHref(src: string): string {
  return `${src}?${VIDEO_DOWNLOAD_QUERY_PARAM}=${VIDEO_DOWNLOAD_QUERY_VALUE}`;
}
