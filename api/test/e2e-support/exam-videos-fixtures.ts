// Минимальные валидные байты видео для e2e (ADR-0133) — формат сервер
// определяет по сигнатуре первой части, не по заголовку
// (video-uploads/video-upload-part.ts), поэтому сигнатура обязана быть
// настоящей. Общий хелпер для e2e видео вопроса и любого другого e2e, которому
// нужен файл видео (CLAUDE.md «Дубли»).
import { randomUUID } from 'crypto';
import request from 'supertest';
import type { ExamVideoDto, VideoUploadDto } from '@xuanxue/shared';
import type { TestApp } from './create-app';
import { withCsrf } from './http';

export function mp4Bytes(size = 64): Buffer {
  const head = Buffer.concat([
    Buffer.from([0, 0, 0, 0x20]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from('isom', 'ascii'),
  ]);
  return Buffer.concat([head, Buffer.alloc(Math.max(size - head.length, 0))]);
}

function assertOk(step: string, res: request.Response): void {
  if (res.status >= 400) {
    throw new Error(`uploadExamVideo: ${step} вернул ${res.status}: ${res.text}`);
  }
}

/** Видео вопроса тремя шагами — единственный путь загрузки (ADR-0165): старт,
 * единственная часть, complete. Для файла не больше одной части (8 МиБ);
 * многочастные и отказные случаи — exam-videos-parts.e2e-spec.ts. */
export async function uploadExamVideo(
  server: ReturnType<TestApp['app']['getHttpServer']>,
  cookie: string,
  bytes: Buffer = mp4Bytes(),
): Promise<ExamVideoDto> {
  const started = await withCsrf(request(server).post('/api/exam-videos/uploads'))
    .set('Cookie', cookie)
    .send({ sizeBytes: bytes.length, fingerprint: `${bytes.length}:${randomUUID()}` });
  assertOk('старт', started);
  const { id } = started.body as VideoUploadDto;
  const part = await withCsrf(request(server).put(`/api/exam-videos/${id}/parts/1`))
    .set('Cookie', cookie)
    .set('Content-Type', 'application/octet-stream')
    .send(bytes);
  assertOk('часть', part);
  const done = await withCsrf(
    request(server).post(`/api/exam-videos/${id}/complete`),
  ).set('Cookie', cookie);
  assertOk('complete', done);
  return done.body as ExamVideoDto;
}
