// Записи карты маршрутов (api-routes.ts, ADR-0148) — видео вопросов и
// вариантов (ADR-0133): число для раздела «Экзамены» и загрузка частями
// (ADR-0165: старт → части → complete, как у видео-ответа). Загрузки одним
// сырым телом (`POST /exam-videos`) больше нет; `GET /exam-videos/:id` — 302
// для `<video src>` — в карту не входит.
import type {
  ExamVideoDto,
  ExamVideoStatsDto,
  ReplaceExamVideoInput,
  StartExamVideoInput,
} from './exam-videos';
import type { RawBody } from './raw-body';
import type {
  CompleteVideoUploadInput,
  SetVideoCodecInput,
  SetVideoPosterInput,
  VideoUploadDto,
} from './video-uploads';

export interface ExamVideosRoutes {
  'GET /exam-videos/stats-summary': {
    query: undefined;
    body: undefined;
    response: ExamVideoStatsDto;
  };
  'POST /exam-videos/uploads': {
    query: undefined;
    body: StartExamVideoInput;
    response: VideoUploadDto;
  };
  'PUT /exam-videos/:id/parts/:n': {
    query: undefined;
    body: RawBody;
    response: VideoUploadDto;
  };
  'POST /exam-videos/:id/complete': {
    query: undefined;
    body: CompleteVideoUploadInput;
    response: ExamVideoDto;
  };
  /** Готовые видео без кадра-превью, не больше VIDEOS_WITHOUT_POSTER_BATCH за
   * раз (ADR-0182); штат. Байты видео для снимка — `GET /exam-videos/:id/bytes`,
   * его открывает декодер в браузере сам, как `GET /exam-videos/:id` плеер, —
   * в карту не входит. */
  'GET /exam-videos/without-poster': {
    query: undefined;
    body: undefined;
    response: ExamVideoDto[];
  };
  /** Кадр-превью для видео, у которого его нет (ADR-0182); штат. Повтор и
   * второй кадр на то же видео — не ошибка: первый записанный остаётся. */
  'PUT /exam-videos/:id/poster': {
    query: undefined;
    body: SetVideoPosterInput;
    response: ExamVideoDto;
  };
  /** Готовые видео, не известные как H.264, не больше VIDEOS_CODEC_PENDING_BATCH
   * за раз (ADR-0189); штат. Байты — тот же `GET /exam-videos/:id/bytes`. */
  'GET /exam-videos/codec-pending': {
    query: undefined;
    body: undefined;
    response: ExamVideoDto[];
  };
  /** Кодек старого видео, прочитанный браузером штата (ADR-0189). */
  'PUT /exam-videos/:id/codec': {
    query: undefined;
    body: SetVideoCodecInput;
    response: ExamVideoDto;
  };
  /** Подменить файл видео перегнанным в H.264 (ADR-0189); штат. Ответ — то же
   * видео с новым файлом. */
  'POST /exam-videos/:id/replace': {
    query: undefined;
    body: ReplaceExamVideoInput;
    response: ExamVideoDto;
  };
}

export const EXAM_VIDEOS_ROUTE_KEYS: Record<keyof ExamVideosRoutes, true> = {
  'GET /exam-videos/stats-summary': true,
  'POST /exam-videos/uploads': true,
  'PUT /exam-videos/:id/parts/:n': true,
  'POST /exam-videos/:id/complete': true,
  'GET /exam-videos/without-poster': true,
  'PUT /exam-videos/:id/poster': true,
  'GET /exam-videos/codec-pending': true,
  'PUT /exam-videos/:id/codec': true,
  'POST /exam-videos/:id/replace': true,
};
