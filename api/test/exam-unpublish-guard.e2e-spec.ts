// e2e на гард снятия формы с публикации (F10, аудит 2026-10-01): пока ученик
// сдаёт, PATCH status=draft/archived — 409 в конверте, иначе карточка
// «Продолжить» пропадала бы из /me/exams и бота. Отдельный файл, не
// exams.e2e-spec.ts: тот выше потолка файлового храповика (CLAUDE.md
// «Храповики»). Настоящий AppModule на MongoMemoryServer.
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import type { ApiErrorBody, ExamDto } from '@xuanxue/shared';
import request from 'supertest';
import { ExamAttemptRecord } from '../src/exams/exam-attempt.schema';
import { ExamItemRecord } from '../src/exams/exam-item.schema';
import { ExamRecord } from '../src/exams/exam.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Exams — снятие с публикации при идущей попытке (e2e)', () => {
  let testApp: TestApp;
  let examModel: Model<ExamRecord>;
  let itemModel: Model<ExamItemRecord>;
  let attemptModel: Model<ExamAttemptRecord>;

  beforeAll(async () => {
    testApp = await createTestApp();
    examModel = testApp.app.get<Model<ExamRecord>>(getModelToken(ExamRecord.name), {
      strict: false,
    });
    itemModel = testApp.app.get<Model<ExamItemRecord>>(
      getModelToken(ExamItemRecord.name),
      { strict: false },
    );
    attemptModel = testApp.app.get<Model<ExamAttemptRecord>>(
      getModelToken(ExamAttemptRecord.name),
      { strict: false },
    );
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await examModel.deleteMany({});
    await itemModel.deleteMany({});
    await attemptModel.deleteMany({});
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  function patchExam(cookie: string, id: string, body: Record<string, unknown>) {
    return withCsrf(request(server()).patch(`/api/exams/${id}`))
      .set('Cookie', cookie)
      .send(body);
  }

  async function publishedExam(cookie: string): Promise<ExamDto> {
    const item = await itemModel.create({
      kind: 'text',
      prompt: 'вопрос',
      status: 'published',
    });
    const created = await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', cookie)
      .send({
        title: 'Экзамен по третьей форме',
        blocks: [{ title: 'Форма', itemIds: [item._id.toString()] }],
      });
    const dto = created.body as ExamDto;
    const published = await patchExam(cookie, dto.id, { status: 'published' });
    return published.body as ExamDto;
  }

  it('PATCH status=archived при идущей попытке — 409 в конверте; после сдачи — 200', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const exam = await publishedExam(cookie);
    const attempt = await attemptModel.create({
      examId: exam.id,
      examTitle: exam.title,
      userId: new Types.ObjectId(),
      attemptNo: 1,
      status: 'in_progress',
      startedAt: new Date(),
    });

    const refused = await patchExam(cookie, exam.id, { status: 'archived' });
    expect(refused.status).toBe(409);
    const body = refused.body as ApiErrorBody;
    expect(body.code).toBe('conflict');
    expect(body.message).toContain('Дождитесь сдачи');
    expect(typeof body.requestId).toBe('string');

    await attemptModel.updateOne(
      { _id: attempt._id },
      { $set: { status: 'submitted', submittedAt: new Date() } },
    );
    const archived = await patchExam(cookie, exam.id, { status: 'archived' });
    expect(archived.status).toBe(200);
    expect((archived.body as ExamDto).status).toBe('archived');
  });

  it('правка полей опубликованной формы при идущей попытке — 200, гард не задевает', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const exam = await publishedExam(cookie);
    await attemptModel.create({
      examId: exam.id,
      examTitle: exam.title,
      userId: new Types.ObjectId(),
      attemptNo: 1,
      status: 'in_progress',
      startedAt: new Date(),
    });

    const patched = await patchExam(cookie, exam.id, { level: 'начальный' });

    expect(patched.status).toBe(200);
    expect((patched.body as ExamDto).status).toBe('published');
  });
});
