// Адреса видео-ответа ученика частями через инстанс (ADR-0137) — отдельный
// файл от examVideoPaths.ts: тот про видео вопроса/варианта (ADR-0133,
// референс учителя, одно тело), это — про другую коллекцию `answer_videos`
// и другой протокол (старт → части → complete), CLAUDE.md «Храповики»
// (файловый лимит) и «Одна механика — один компонент» (свой домен — свой
// файл путей, examVideoSrc остался в соседнем файле по прямому указанию ТЗ
// этапа — плеер уже импортирует оттуда).
const ANSWER_VIDEOS_PATH = '/answer-videos';
export const ANSWER_VIDEO_STATS_PATH = `${ANSWER_VIDEOS_PATH}/stats-summary`;

/** `POST /attempts/:id/answer-video` — начать или продолжить загрузку файла
 * этого вопроса. */
export function attemptAnswerVideoStartPath(attemptId: string): string {
  return `/attempts/${attemptId}/answer-video`;
}

/** `PUT /answer-videos/:id/parts/:n` — одна часть, сырым телом. */
export function answerVideoPartPath(uploadId: string, partNumber: number): string {
  return `${ANSWER_VIDEOS_PATH}/${uploadId}/parts/${partNumber}`;
}

/** `POST /answer-videos/:id/complete` — завершить загрузку, получить
 * `ExamMediaDto`. */
export function answerVideoCompletePath(uploadId: string): string {
  return `${ANSWER_VIDEOS_PATH}/${uploadId}/complete`;
}
