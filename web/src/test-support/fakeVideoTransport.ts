// Фейковый транспорт общего загрузчика видео (video-upload/, ADR-0165) для
// тестов прогона и хука: сеть не нужна, ответ сервера задаётся значением, а
// число вызовов — `vi.fn`. Файл из трёх частей по 8 байт, как в этих тестах
// всегда (20 байт → 3 части).
import { vi } from 'vitest';
import type {
  VideoUploadSession,
  VideoUploadTransport,
} from '../video-upload/videoUploadTypes';

export interface FakeUploadResult {
  id: string;
}

export const FAKE_UPLOAD_RESULT: FakeUploadResult = { id: 'm1' };

const FAKE_PART_COUNT = 3;

/** Ответ сервера с уже принятыми частями. */
export function fakeSession(receivedParts: number[] = []): VideoUploadSession {
  return { id: 'u1', partBytes: 8, partCount: FAKE_PART_COUNT, receivedParts };
}

/** Ответ сервера, принявшего части с первой по `last`: так он отвечает, пока
 * части идут по порядку (начатая с середины загрузка продолжается теми же
 * ответами). */
export function fakeSessionUpTo(last: number): VideoUploadSession {
  return fakeSession(Array.from({ length: last }, (_, index) => index + 1));
}

type FakeTransport = VideoUploadTransport<FakeUploadResult>;

/** Любой из трёх вызовов можно заменить своим — он всё равно остаётся
 * `vi.fn`, и тест считает его вызовы. */
export function makeFakeTransport(overrides: Partial<FakeTransport> = {}) {
  return {
    start: vi.fn<FakeTransport['start']>(
      overrides.start ?? (() => Promise.resolve(fakeSession())),
    ),
    uploadPart: vi.fn<FakeTransport['uploadPart']>(
      overrides.uploadPart ??
        ((_uploadId, partNumber) => Promise.resolve(fakeSessionUpTo(partNumber))),
    ),
    complete: vi.fn<FakeTransport['complete']>(
      overrides.complete ?? (() => Promise.resolve(FAKE_UPLOAD_RESULT)),
    ),
  };
}
