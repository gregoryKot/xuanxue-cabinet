// e2e: картинка варианта ответа проходит весь путь — вопрос банка → снимок
// попытки → ученик/учитель/статистика (ADR-0035, PLAN §11 слой 4.2). Роли и
// раздача самой картинки уже покрыты exam-images.e2e-spec.ts (тот файл не
// трогаем — он проверяет правило доступа отдельно, прямой правкой Mongo);
// здесь — путь картинки через настоящие эндпоинты насквозь, без единой прямой
// правки базы. Настоящий AppModule на MongoMemoryServer — образцы
// exam-items.e2e-spec.ts/exam-attempts.e2e-spec.ts.
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import type {
  ApiErrorBody,
  AttemptReviewDto,
  ExamAttemptDto,
  ExamDto,
  ExamImageDto,
  ExamItemDto,
  ExamItemStatsDto,
  UserRole,
} from '@xuanxue/shared';
import {
  EXAM_IMAGE_NOT_FOUND_MESSAGE,
  OPTION_TEXT_OR_IMAGE_MESSAGE,
} from '@xuanxue/shared';
import { ExamItemRecord } from '../src/exams/exam-item.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';
import { jpegBytes } from './e2e-support/exam-images-fixtures';

describe('Картинки вариантов ответа — весь путь (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  async function sessionFor(roles: UserRole[]): Promise<string> {
    return sessionCookieFor(testApp.app, roles);
  }

  function postItem(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', cookie)
      .send(body);
  }

  function patchItem(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/exam-items/${id}`))
      .set('Cookie', cookie)
      .send(body);
  }

  async function uploadImage(cookie: string): Promise<string> {
    const res = await withCsrf(request(server()).post('/api/exam-images'))
      .set('Cookie', cookie)
      .set('Content-Type', 'image/jpeg')
      .send(jpegBytes());
    return (res.body as ExamImageDto).id;
  }

  // Сырой документ мимо сервиса — единственный способ увидеть imageIds
  // (плоское поле, не входит в ExamItemDto).
  async function rawImageIds(id: string): Promise<string[]> {
    const model = testApp.app.get<Model<ExamItemRecord>>(
      getModelToken(ExamItemRecord.name),
      { strict: false },
    );
    const doc = await model.collection.findOne<{ imageIds?: unknown[] }>({
      _id: new Types.ObjectId(id),
    });
    if (!doc) throw new Error('документ не найден в сырой Mongo');
    return (doc.imageIds ?? []).map((v) => String(v));
  }

  async function publishExamWithItem(
    teacherCookie: string,
    itemId: string,
  ): Promise<string> {
    const exam = await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', teacherCookie)
      .send({ title: 'Экзамен с картинкой', blocks: [{ itemIds: [itemId] }] });
    const examId = (exam.body as ExamDto).id;
    await withCsrf(request(server()).patch(`/api/exams/${examId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });
    return examId;
  }

  it('POST single с imageId несуществующей картинки — 400, EXAM_IMAGE_NOT_FOUND_MESSAGE', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await postItem(cookie, {
      kind: 'single',
      prompt: 'Какая стойка на фото?',
      options: [
        { imageId: new Types.ObjectId().toString(), correct: true },
        { text: 'Другая стойка', correct: false },
      ],
    });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).message).toBe(EXAM_IMAGE_NOT_FOUND_MESSAGE);
  });

  it('POST вариант из пробелов без картинки — 400, OPTION_TEXT_OR_IMAGE_MESSAGE', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await postItem(cookie, {
      kind: 'single',
      prompt: 'Какая стойка на фото?',
      options: [
        { text: '   ', correct: true },
        { text: 'Другая стойка', correct: false },
      ],
    });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).message).toBe(OPTION_TEXT_OR_IMAGE_MESSAGE);
  });

  it('вопрос с вариантом-картинкой без текста — 201, options[i].imageId, text пуст', async () => {
    const cookie = await sessionFor(['teacher']);
    const imageId = await uploadImage(cookie);

    const res = await postItem(cookie, {
      kind: 'single',
      prompt: 'Какая стойка на фото?',
      options: [
        { imageId, correct: true },
        { text: 'Другая стойка', correct: false },
      ],
    });

    expect(res.status).toBe(201);
    const dto = res.body as ExamItemDto;
    expect(dto.options[0]?.imageId).toBe(imageId);
    expect(dto.options[0]?.text).toBe('');
  });

  it('read-after-write через снимок: старт попытки несёт imageId, картинка доступна ученику попытки, не чужому (ADR-0035)', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const imageId = await uploadImage(teacherCookie);
    const item = await postItem(teacherCookie, {
      kind: 'single',
      prompt: 'Какая стойка на фото?',
      options: [
        { imageId, correct: true },
        { text: 'Другая стойка', correct: false },
      ],
    });
    const itemId = (item.body as ExamItemDto).id;
    const examId = await publishExamWithItem(teacherCookie, itemId);

    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);
    expect(started.status).toBe(201);
    const startedOptions =
      (started.body as ExamAttemptDto).blocks[0]?.questions[0]?.options ?? [];
    expect(startedOptions[0]?.imageId).toBe(imageId);

    const ownView = await request(server())
      .get(`/api/exam-images/${imageId}`)
      .set('Cookie', studentCookie);
    expect(ownView.status).toBe(200);

    const { cookie: strangerCookie } = await createUserWithSession(testApp.app, {
      name: 'Другой ученик',
      roles: [],
    });
    const strangerView = await request(server())
      .get(`/api/exam-images/${imageId}`)
      .set('Cookie', strangerCookie);
    expect(strangerView.status).toBe(404);
  });

  it('карточка проверки учителя и статистика вопроса содержат imageId варианта', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const imageId = await uploadImage(teacherCookie);
    const item = await postItem(teacherCookie, {
      kind: 'single',
      prompt: 'Какая стойка на фото?',
      options: [
        { imageId, correct: true },
        { text: 'Другая стойка', correct: false },
      ],
    });
    const itemId = (item.body as ExamItemDto).id;
    const examId = await publishExamWithItem(teacherCookie, itemId);

    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);
    const attemptId = (started.body as ExamAttemptDto).id;
    await withCsrf(request(server()).post(`/api/attempts/${attemptId}/submit`)).set(
      'Cookie',
      studentCookie,
    );

    const review = await request(server())
      .get(`/api/attempts/${attemptId}/review`)
      .set('Cookie', teacherCookie);
    expect(review.status).toBe(200);
    const reviewOptions =
      (review.body as AttemptReviewDto).blocks[0]?.questions[0]?.options ?? [];
    expect(reviewOptions[0]?.imageId).toBe(imageId);

    const stats = await request(server())
      .get(`/api/exam-items/${itemId}/stats`)
      .set('Cookie', teacherCookie);
    expect(stats.status).toBe(200);
    expect((stats.body as ExamItemStatsDto).options?.[0]?.imageId).toBe(imageId);
  });

  it('PATCH заменяет картинку у опубликованного вопроса — version 2, history несёт старую, imageIds документа — обе', async () => {
    const cookie = await sessionFor(['teacher']);
    const oldImageId = await uploadImage(cookie);
    const newImageId = await uploadImage(cookie);
    const created = await postItem(cookie, {
      kind: 'single',
      prompt: 'p',
      options: [
        { imageId: oldImageId, correct: true },
        { text: 'B', correct: false },
      ],
    });
    const dto = created.body as ExamItemDto;

    const patched = await patchItem(cookie, dto.id, {
      options: [
        { imageId: newImageId, correct: true },
        { text: 'B', correct: false },
      ],
    });

    expect(patched.status).toBe(200);
    const updated = patched.body as ExamItemDto;
    expect(updated.version).toBe(2);
    expect(updated.history[0]?.options[0]?.imageId).toBe(oldImageId);

    const imageIds = await rawImageIds(dto.id);
    expect(imageIds.sort()).toEqual([oldImageId, newImageId].sort());
  });
});
