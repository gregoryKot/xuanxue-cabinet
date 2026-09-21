// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты») — сама выборка из
// media_assets проверена в media-assets.service.spec.ts.
import type { AttemptReviewDto, ExamAttemptDto, ExamMediaDto } from '@xuanxue/shared';
import type { MediaAssetsService } from '../media/media-assets.service';
import {
  withAttemptMedia,
  withAttemptsMedia,
  withReviewMedia,
} from './exam-attempt-media';

const MEDIA: ExamMediaDto = {
  id: 'm1',
  attemptId: 'a1',
  kind: 'link',
  url: 'https://vk.com/video-1',
  receivedAt: '2026-09-12T10:00:00.000Z',
};

const ATTEMPT: ExamAttemptDto = {
  id: 'a1',
  examId: 'e1',
  examTitle: 'Экзамен',
  userId: 'u1',
  status: 'in_progress',
  blocks: [],
  answers: [],
  startedAt: '2026-09-12T10:00:00.000Z',
  expired: false,
};

function fakeService(byAttempt: Map<string, ExamMediaDto[]>): MediaAssetsService {
  return {
    listForAttempt: (id: string) => Promise.resolve(byAttempt.get(id) ?? []),
    listForAttempts: (ids: string[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, byAttempt.get(id) ?? []]))),
  } as unknown as MediaAssetsService;
}

describe('withAttemptMedia', () => {
  it('подмешивает media одной попытки', async () => {
    const service = fakeService(new Map([['a1', [MEDIA]]]));

    const result = await withAttemptMedia(service, ATTEMPT);

    expect(result.media).toEqual([MEDIA]);
    expect(result.id).toBe('a1'); // остальные поля не тронуты
  });

  it('нет видео — пустой массив, не undefined', async () => {
    const service = fakeService(new Map());

    const result = await withAttemptMedia(service, ATTEMPT);

    expect(result.media).toEqual([]);
  });
});

describe('withAttemptsMedia', () => {
  it('один запрос на список — каждая попытка получает своё media', async () => {
    const other = { ...ATTEMPT, id: 'a2' };
    const service = fakeService(new Map([['a1', [MEDIA]]]));

    const result = await withAttemptsMedia(service, [ATTEMPT, other]);

    expect(result[0]?.media).toEqual([MEDIA]);
    expect(result[1]?.media).toEqual([]);
  });
});

describe('withReviewMedia', () => {
  it('подмешивает media по attemptId карточки проверки', async () => {
    const review: AttemptReviewDto = {
      attemptId: 'a1',
      examId: 'e1',
      examTitle: 'Экзамен',
      userId: 'u1',
      userName: 'Ученик',
      status: 'submitted',
      blocks: [],
      notifiesUserInTelegram: false,
    };
    const service = fakeService(new Map([['a1', [MEDIA]]]));

    const result = await withReviewMedia(service, review);

    expect(result.media).toEqual([MEDIA]);
  });
});
