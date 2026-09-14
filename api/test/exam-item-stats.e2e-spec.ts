// e2e на статистику вопроса банка (`GET /exam-items/:id/stats`,
// `GET /exam-items/stats-summary`, слой 4.8, docs/PLAN.md §11) — отдельный
// файл, не exam-items.e2e-spec.ts: тот уже на потолке файлового храповика
// (CLAUDE.md «Файлы»). Настоящий AppModule на MongoMemoryServer — те же
// гвард/пайпы/фильтры, что видит браузер (ADR-0010: доступ по роли, не по
// владельцу — обе ручки живут на контроллере банка вопросов).
import type {
  ExamAttemptDto,
  ExamDto,
  ExamItemDto,
  ExamItemStatsDto,
  ExamItemStatsSummaryDto,
  UserRole,
} from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Exam item stats (e2e)', () => {
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

  function optionId(dto: ExamItemDto, correct: boolean): string {
    const option = dto.options.find((o) => o.correct === correct);
    if (!option) throw new Error('вариант не найден');
    return option.id;
  }

  // Опубликованный вопрос с двумя вариантами и опубликованная форма — через
  // настоящие эндпоинты учителя, как в exam-attempts.e2e-spec.ts: здесь не
  // тестируется сам банк/форма, важно только реальное состояние для стата.
  async function createPublishedSingleChoiceExam(
    teacherCookie: string,
  ): Promise<{ examId: string; item: ExamItemDto }> {
    const created = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', teacherCookie)
      .send({
        kind: 'single',
        prompt: 'Сколько форм в базовом комплексе?',
        options: [
          { text: 'пять', correct: true },
          { text: 'три', correct: false },
        ],
      });
    const itemId = (created.body as ExamItemDto).id;
    await withCsrf(request(server()).patch(`/api/exam-items/${itemId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });
    const item = await request(server())
      .get(`/api/exam-items/${itemId}`)
      .set('Cookie', teacherCookie);

    const exam = await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', teacherCookie)
      .send({ title: 'Экзамен для статистики', blocks: [{ itemIds: [itemId] }] });
    const examId = (exam.body as ExamDto).id;
    await withCsrf(request(server()).patch(`/api/exams/${examId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });

    return { examId, item: item.body as ExamItemDto };
  }

  async function submitAnswer(
    examId: string,
    itemId: string,
    optionIds: string[],
  ): Promise<void> {
    const studentCookie = await sessionFor([]);
    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);
    const attemptId = (started.body as ExamAttemptDto).id;
    await withCsrf(request(server()).patch(`/api/attempts/${attemptId}/answers`))
      .set('Cookie', studentCookie)
      .send({ answers: [{ itemId, optionIds }] });
    await withCsrf(request(server()).post(`/api/attempts/${attemptId}/submit`)).set(
      'Cookie',
      studentCookie,
    );
  }

  it('ученик: GET /exam-items/:id/stats и /exam-items/stats-summary — 403', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { item } = await createPublishedSingleChoiceExam(teacherCookie);
    const cookie = await sessionFor([]);

    const statsRes = await request(server())
      .get(`/api/exam-items/${item.id}/stats`)
      .set('Cookie', cookie);
    expect(statsRes.status).toBe(403);

    const summaryRes = await request(server())
      .get('/api/exam-items/stats-summary')
      .set('Cookie', cookie);
    expect(summaryRes.status).toBe(403);
  });

  it('учитель: два верных, один неверный — askedCount 3, correctCount 2, доля по вариантам', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId, item } = await createPublishedSingleChoiceExam(teacherCookie);
    const correctOptionId = optionId(item, true);
    const wrongOptionId = optionId(item, false);

    await submitAnswer(examId, item.id, [correctOptionId]);
    await submitAnswer(examId, item.id, [correctOptionId]);
    await submitAnswer(examId, item.id, [wrongOptionId]);

    const res = await request(server())
      .get(`/api/exam-items/${item.id}/stats`)
      .set('Cookie', teacherCookie);

    expect(res.status).toBe(200);
    const stats = res.body as ExamItemStatsDto;
    expect(stats.askedCount).toBe(3);
    expect(stats.correctCount).toBe(2);
    expect(stats.correctRate).toBeCloseTo(2 / 3);
    const correctOption = stats.options?.find((o) => o.id === correctOptionId);
    expect(correctOption).toMatchObject({ correct: true, chosenCount: 2 });
  });

  it('вопрос, которого ни разу не задавали — честный ноль, без доли', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const created = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', teacherCookie)
      .send({ kind: 'text', prompt: 'Опишите форму «пэнбу»' });
    const itemId = (created.body as ExamItemDto).id;

    const res = await request(server())
      .get(`/api/exam-items/${itemId}/stats`)
      .set('Cookie', teacherCookie);

    expect(res.status).toBe(200);
    const stats = res.body as ExamItemStatsDto;
    expect(stats.askedCount).toBe(0);
    expect(stats.correctCount).toBeUndefined();
    expect(stats.correctRate).toBeUndefined();
    expect(stats.options).toBeUndefined();
  });

  it('GET /exam-items/stats-summary — учитель видит число, растущее вместе со спотыкающимся вопросом', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const before = await request(server())
      .get('/api/exam-items/stats-summary')
      .set('Cookie', teacherCookie);

    const { examId, item } = await createPublishedSingleChoiceExam(teacherCookie);
    const wrongOptionId = optionId(item, false);
    // Оба ученика ошибаются — больше половины ответов на этот вопрос неверны.
    await submitAnswer(examId, item.id, [wrongOptionId]);
    await submitAnswer(examId, item.id, [wrongOptionId]);

    const after = await request(server())
      .get('/api/exam-items/stats-summary')
      .set('Cookie', teacherCookie);

    expect(after.status).toBe(200);
    expect((after.body as ExamItemStatsSummaryDto).strugglingCount).toBe(
      (before.body as ExamItemStatsSummaryDto).strugglingCount + 1,
    );
  });
});
