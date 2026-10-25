// Общие HTTP-хелперы e2e загрузки видео вопроса частями (ADR-0165) — делят
// exam-videos-parts.e2e-spec.ts и exam-videos-poster.e2e-spec.ts (тот же приём,
// что answer-video-fixtures.ts: файл-лимит спеков без дублей, CLAUDE.md
// «Храповики»/jscpd).
import request from 'supertest';
import type { CompleteVideoUploadInput } from '@xuanxue/shared';
import { withCsrf } from './http';
import type { TestApp } from './create-app';

/** `getApp` — геттер, не значение: вызывается лениво из `it()`, когда
 * `beforeAll` уже присвоил testApp. `base` — маршрут вида видео: у записи занятия
 * (ADR-0180) тот же протокол частей под своим адресом. */
export function createExamVideoPartsHelpers(
  getApp: () => TestApp,
  base = '/api/exam-videos',
) {
  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    getApp().app.getHttpServer();

  function start(
    cookie: string | undefined,
    sizeBytes: number,
    fingerprint = `${sizeBytes}:1`,
  ): request.Test {
    const req = withCsrf(request(server()).post(`${base}/uploads`));
    return (cookie ? req.set('Cookie', cookie) : req).send({ sizeBytes, fingerprint });
  }

  function putPart(
    cookie: string | undefined,
    id: string,
    n: number,
    bytes: Buffer,
  ): request.Test {
    const req = withCsrf(request(server()).put(`${base}/${id}/parts/${n}`)).set(
      'Content-Type',
      'application/octet-stream',
    );
    return (cookie ? req.set('Cookie', cookie) : req).send(bytes);
  }

  function complete(
    cookie: string | undefined,
    id: string,
    body?: CompleteVideoUploadInput,
  ): request.Test {
    const req = withCsrf(request(server()).post(`${base}/${id}/complete`));
    const withSession = cookie ? req.set('Cookie', cookie) : req;
    return body ? withSession.send(body) : withSession;
  }

  return { server, start, putPart, complete };
}
