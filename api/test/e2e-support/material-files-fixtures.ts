// Хелперы e2e файлов материалов (ADR-0057) — тот же приём, что у
// exam-images-fixtures.ts: одна форма запроса на все тесты слоя, чтобы
// спека оставалась про поведение, а не про сборку supertest-запросов.
import type request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { MaterialDto } from '@xuanxue/shared';
import { DOCX_BYTES } from '../../src/common/zip-fixture.test-support';
import { withCsrf } from './http';

/** Настоящая сигнатура PDF: формат сервер определяет по байтам, не по
 * заголовку (common/raw-upload.ts). */
export const PDF_BYTES = Buffer.concat([
  Buffer.from('%PDF-1.7\n', 'ascii'),
  Buffer.alloc(64),
]);
export const FILE_NAME = 'Методичка по ба-гуа.pdf';

/** `.docx` — единственный формат, у которого сигнатуры первых байтов мало
 * (это ZIP, как и любой OOXML): узнают его по записям центрального
 * каталога, поэтому байты приходят из настоящего сборщика ZIP, а не из
 * заглушки (ADR-0080). */
export { DOCX_BYTES };
export const DOCX_FILE_NAME = 'Методичка по ба-гуа.docx';

export const OPEN_MATERIAL = {
  title: 'Разбор формы',
  url: 'https://example.com/open',
  kind: 'document',
  access: 'all',
};
export const STAFF_MATERIAL = {
  title: 'Толкающие руки, разбор для преподавателей',
  url: 'https://example.com/staff-only',
  kind: 'document',
  access: 'staff',
};

type Server = ReturnType<NestExpressApplication['getHttpServer']>;

export interface MaterialFileRequests {
  postMaterial: (cookie: string, body: Record<string, unknown>) => request.Test;
  uploadFile: (
    cookie: string,
    id: string,
    bytes?: Buffer,
    contentType?: string,
    name?: string,
  ) => request.Test;
  deleteFile: (cookie: string, id: string) => request.Test;
  deleteMaterial: (cookie: string, id: string) => request.Test;
  /** Материал с уже загруженным файлом — две трети тестов начинаются с него. */
  materialWithFile: (
    cookie: string,
    body: Record<string, unknown>,
  ) => Promise<MaterialDto>;
}

export function createMaterialFileRequests(
  agent: typeof request,
  server: () => Server,
): MaterialFileRequests {
  const postMaterial = (cookie: string, body: Record<string, unknown>): request.Test =>
    withCsrf(agent(server()).post('/api/materials')).set('Cookie', cookie).send(body);

  const uploadFile = (
    cookie: string,
    id: string,
    bytes: Buffer = PDF_BYTES,
    contentType = 'application/pdf',
    name = FILE_NAME,
  ): request.Test =>
    withCsrf(
      agent(server()).post(`/api/materials/${id}/file?name=${encodeURIComponent(name)}`),
    )
      .set('Cookie', cookie)
      .set('Content-Type', contentType)
      .send(bytes);

  return {
    postMaterial,
    uploadFile,
    deleteFile: (cookie, id) =>
      withCsrf(agent(server()).delete(`/api/materials/${id}/file`)).set('Cookie', cookie),
    deleteMaterial: (cookie, id) =>
      withCsrf(agent(server()).delete(`/api/materials/${id}`)).set('Cookie', cookie),
    materialWithFile: async (cookie, body) => {
      const created = await postMaterial(cookie, body);
      const uploaded = await uploadFile(cookie, (created.body as MaterialDto).id);
      return uploaded.body as MaterialDto;
    },
  };
}
