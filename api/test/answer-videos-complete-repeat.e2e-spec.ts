// e2e видео-ответа ученика (ADR-0137, ADR-0165) — повтор `complete`. Аудит
// 2026-10-01, F47: ответ первого вызова мог потеряться по дороге, повтор не
// должен ни падать, ни плодить записи, ни отдавать чужое. Основной путь и
// владение — answer-videos.e2e-spec.ts (файл-лимит, тот же приём, что
// answer-videos-errors.e2e-spec.ts).
import request from 'supertest';
import type { AnswerVideoUploadDto, ExamAttemptDto } from '@xuanxue/shared';
import { FileStoreService } from '../src/storage/file-store.service';
import { MultipartStoreService } from '../src/storage/multipart-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import {
  createAnswerVideoTestHelpers,
  partBuffer,
  SMALL_SIZE,
} from './e2e-support/answer-video-fixtures';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { FakeMultipartStore } from './e2e-support/fake-multipart-store';
import { createExamMediaTestHelpers } from './e2e-support/exam-media-fixtures';
import { createUserWithSession } from './e2e-support/session';

describe('Видео-ответ ученика — повтор complete (e2e, ADR-0165)', () => {
  let testApp: TestApp;
  const { startedAttemptWithItems } = createExamMediaTestHelpers(() => testApp);
  const { server, start, uploadPart, complete } = createAnswerVideoTestHelpers(
    () => testApp,
  );

  beforeAll(async () => {
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(FileStoreService).useValue(new FakeFileStore());
      builder.overrideProvider(MultipartStoreService).useValue(new FakeMultipartStore());
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('повторный complete — тот же ответ и одна запись в попытке; чужому 404', async () => {
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const { cookie: strangerCookie } = await createUserWithSession(testApp.app, {
      name: 'Чужой',
      roles: [],
    });
    const { attemptId, videoItemId } = await startedAttemptWithItems(studentCookie);
    const started = await start(studentCookie, attemptId, videoItemId, SMALL_SIZE);
    const upload = started.body as AnswerVideoUploadDto;
    await uploadPart(studentCookie, upload.id, 1, partBuffer(SMALL_SIZE, true));

    const first = await complete(studentCookie, upload.id);
    const again = await complete(studentCookie, upload.id);
    const strangerAgain = await complete(strangerCookie, upload.id);

    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(strangerAgain.status).toBe(404);
    const readBack = await request(server())
      .get(`/api/attempts/${attemptId}`)
      .set('Cookie', studentCookie);
    const files = ((readBack.body as ExamAttemptDto).media ?? []).filter(
      (m) => m.kind === 'file',
    );
    expect(files).toHaveLength(1);
  });
});
