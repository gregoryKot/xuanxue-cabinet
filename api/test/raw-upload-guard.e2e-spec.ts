// e2e меры 1 против буферизации сырого тела до гвардов (SECURITY §4,
// ADR-0083). Отдельный файл, а не довесок к material-files.e2e-spec.ts
// (тот уже на потолке файла-храповика, CLAUDE.md «Храповики») — тест один,
// узкий, про саму механику предиката, не про файлы материалов.
//
// Картинки вариантов ответа (ADR-0035) свой такой тест уже несут —
// exam-images.e2e-spec.ts, «POST без cookie, но с x-requested-with — 401»:
// AuthGuard и раньше отвечал 401, но до меры 1 тело успевало лечь в память
// первым, а тест этого не видит — увидеть некому, статус ответа тот же.
// Главный тест задачи — для файла материала: у него потолок в 30 раз
// больше картинки (MATERIAL_FILE_LIMITS.maxBytes), и цена бага заметнее.
import request from 'supertest';
import type { ApiErrorBody } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import {
  createMaterialFileRequests,
  type MaterialFileRequests,
} from './e2e-support/material-files-fixtures';

const ANY_MATERIAL_ID = '507f1f77bcf86cd799439011'; // материал заводить не нужно — гвард отказывает раньше сервиса.

describe('Сырое тело до гвардов (e2e, ADR-0083)', () => {
  let testApp: TestApp;
  let api: MaterialFileRequests;

  beforeAll(async () => {
    testApp = await createTestApp();
    api = createMaterialFileRequests(request, () => testApp.app.getHttpServer());
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('POST /api/materials/:id/file без сессии — 401, а не 400 «файл не пришёл»', async () => {
    const res = await api.uploadFile('', ANY_MATERIAL_ID);

    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });
});
