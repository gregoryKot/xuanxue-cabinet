// Общие HTTP-хелперы для e2e видео-ответа (ADR-0137) — делят
// answer-videos.e2e-spec.ts и answer-videos-errors.e2e-spec.ts (тот же приём,
// что exam-attempts-fixtures.ts: файл-лимит спеков без дублей, CLAUDE.md
// «Храповики»/jscpd).
import request from 'supertest';
import { ANSWER_VIDEO_LIMITS } from '@xuanxue/shared';
import { withCsrf } from './http';
import { mp4Bytes } from './exam-videos-fixtures';
import type { TestApp } from './create-app';

// Меньше 8 МиБ — один кусок (partCount === 1), быстрый путь тестов, которым
// сама многочастность не нужна.
export const SMALL_SIZE = 64;
// Больше одной части (partBytes × 1 + хвост) — тесты продолжения/resume.
export const TWO_PART_SIZE = ANSWER_VIDEO_LIMITS.partBytes + 1000;

export function partBuffer(size: number, withSignature: boolean): Buffer {
  return withSignature ? mp4Bytes(size) : Buffer.alloc(size, 1);
}

/** `getApp` — геттер, не значение: как в exam-attempts-fixtures.ts —
 * вызывается лениво из `it()`, когда `beforeAll` уже присвоил testApp. */
export function createAnswerVideoTestHelpers(getApp: () => TestApp) {
  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    getApp().app.getHttpServer();

  function start(
    cookie: string,
    attemptId: string,
    itemId: string,
    sizeBytes: number,
    fingerprint = `${sizeBytes}:1`,
  ): request.Test {
    return withCsrf(request(server()).post(`/api/attempts/${attemptId}/answer-video`))
      .set('Cookie', cookie)
      .send({ itemId, sizeBytes, fingerprint });
  }

  function uploadPart(
    cookie: string,
    id: string,
    n: number,
    bytes: Buffer,
  ): request.Test {
    return withCsrf(request(server()).put(`/api/answer-videos/${id}/parts/${n}`))
      .set('Cookie', cookie)
      .set('Content-Type', 'application/octet-stream')
      .send(bytes);
  }

  function complete(cookie: string, id: string): request.Test {
    return withCsrf(request(server()).post(`/api/answer-videos/${id}/complete`)).set(
      'Cookie',
      cookie,
    );
  }

  return { server, start, uploadPart, complete };
}
