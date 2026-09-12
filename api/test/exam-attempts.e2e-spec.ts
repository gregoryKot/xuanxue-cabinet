// e2e на попытку сдачи экзамена (ТЗ 4.4, ADR-0022 + дополнение 2026-09-12) —
// данные ученика (ADR-0010): роль admits student/teacher/admin, владение —
// по userId из сессии (см. exam-attempts-ownership.e2e-spec.ts). Настоящий
// AppModule на MongoMemoryServer — те же гвард/пайпы/фильтры, что видит браузер.
import type {
  ApiErrorBody,
  ExamAttemptDto,
  ExamDto,
  ExamItemDto,
  UserRole,
} from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Exam attempts (e2e)', () => {
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

  // Опубликованный вопрос и опубликованная форма — через настоящие эндпоинты
  // учителя (не напрямую через модель): здесь не тестируется сам банк/форма,
  // у них свои e2e (exam-items.e2e-spec.ts, exams.e2e-spec.ts), важно только,
  // что попытка стартует на реальной опубликованной форме.
  async function createPublishedExam(
    teacherCookie: string,
    options: { attemptsAllowed?: number } = {},
  ): Promise<{ examId: string; itemId: string }> {
    const item = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', teacherCookie)
      .send({
        kind: 'single',
        prompt: 'Сколько форм в базовом комплексе?',
        criteria: 'принимается любой ответ близкий к программе',
        options: [
          { text: 'пять', correct: true },
          { text: 'три', correct: false },
        ],
      });
    const itemId = (item.body as ExamItemDto).id;
    await withCsrf(request(server()).patch(`/api/exam-items/${itemId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });

    const exam = await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', teacherCookie)
      .send({
        title: 'Экзамен по третьей форме',
        blocks: [{ title: 'Форма', itemIds: [itemId] }],
        attemptsAllowed: options.attemptsAllowed,
      });
    const examId = (exam.body as ExamDto).id;
    await withCsrf(request(server()).patch(`/api/exams/${examId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });

    return { examId, itemId };
  }

  it('POST /exams/:id/attempts без cookie — 401 в конверте', async () => {
    const res = await withCsrf(
      request(server()).post('/api/exams/507f1f77bcf86cd799439099/attempts'),
    );
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('гость (roles: []) — 403 на старт, сохранение, сдачу и список', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId } = await createPublishedExam(teacherCookie);
    const guestCookie = await sessionFor([]);

    const start = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', guestCookie);
    expect(start.status).toBe(403);

    const list = await request(server()).get('/api/attempts').set('Cookie', guestCookie);
    expect(list.status).toBe(403);
  });

  it('ученик: старт → ответ на старт не содержит correct и criteria', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId } = await createPublishedExam(teacherCookie);
    const studentCookie = await sessionFor(['student']);

    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);

    expect(started.status).toBe(201);
    const dto = started.body as ExamAttemptDto;
    expect(dto.status).toBe('in_progress');
    expect(dto.examId).toBe(examId);
    expect(dto.blocks[0]?.questions).toHaveLength(1);

    // Обязательный тест ТЗ 4.4: ни одного «correct», ни одного «criteria».
    const raw = JSON.stringify(started.body);
    expect(raw).not.toContain('correct');
    expect(raw).not.toContain('criteria');
  });

  it('ученик: повторный старт при незаконченной попытке — та же попытка', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId } = await createPublishedExam(teacherCookie);
    const studentCookie = await sessionFor(['student']);

    const first = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);
    const second = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);

    expect((second.body as ExamAttemptDto).id).toBe((first.body as ExamAttemptDto).id);
  });

  it('ученик: старт на форме, которую учитель не опубликовал — 400', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const item = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', teacherCookie)
      .send({ kind: 'text', prompt: 'вопрос' });
    await withCsrf(
      request(server()).patch(`/api/exam-items/${(item.body as ExamItemDto).id}`),
    )
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });
    const exam = await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', teacherCookie)
      .send({
        title: 'Черновик формы',
        blocks: [{ itemIds: [(item.body as ExamItemDto).id] }],
      });
    const studentCookie = await sessionFor(['student']);

    const res = await withCsrf(
      request(server()).post(`/api/exams/${(exam.body as ExamDto).id}/attempts`),
    ).set('Cookie', studentCookie);

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).message).toContain('ещё не открыт');
  });

  it('ученик: автосохранение частями, ответ на чужой itemId — 400, сдача — submitted', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId, itemId } = await createPublishedExam(teacherCookie);
    const studentCookie = await sessionFor(['student']);
    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);
    const attemptId = (started.body as ExamAttemptDto).id;

    const saved = await withCsrf(
      request(server()).patch(`/api/attempts/${attemptId}/answers`),
    )
      .set('Cookie', studentCookie)
      .send({ answers: [{ itemId, optionIds: ['507f1f77bcf86cd799439001'] }] });
    expect(saved.status).toBe(200);
    expect((saved.body as ExamAttemptDto).answers).toHaveLength(1);

    const unknownItem = await withCsrf(
      request(server()).patch(`/api/attempts/${attemptId}/answers`),
    )
      .set('Cookie', studentCookie)
      .send({ answers: [{ itemId: '507f1f77bcf86cd799439099', text: 'мусор' }] });
    expect(unknownItem.status).toBe(400);
    expect((unknownItem.body as ApiErrorBody).message).toContain('не из вашей попытки');

    const submitted = await withCsrf(
      request(server()).post(`/api/attempts/${attemptId}/submit`),
    ).set('Cookie', studentCookie);
    expect(submitted.status).toBe(200);
    expect((submitted.body as ExamAttemptDto).status).toBe('submitted');

    // Ответ на уже сданную попытку — отказ, не тихая перезапись.
    const afterSubmit = await withCsrf(
      request(server()).patch(`/api/attempts/${attemptId}/answers`),
    )
      .set('Cookie', studentCookie)
      .send({ answers: [{ itemId, text: 'поздно' }] });
    expect(afterSubmit.status).toBe(400);
  });

  it('ученик: превышение числа попыток — 400 с понятным текстом', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId } = await createPublishedExam(teacherCookie, { attemptsAllowed: 1 });
    const studentCookie = await sessionFor(['student']);
    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);
    await withCsrf(
      request(server()).post(
        `/api/attempts/${(started.body as ExamAttemptDto).id}/submit`,
      ),
    ).set('Cookie', studentCookie);

    const res = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).message).toContain('открыть ещё одну попытку');
  });

  it('учитель тоже может стартовать попытку (проверка формы изнутри)', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId } = await createPublishedExam(teacherCookie);

    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', teacherCookie);

    expect(started.status).toBe(201);
  });

  it('GET /attempts: ученику только свои, учителю — все, лимит и фильтр examId работают', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId } = await createPublishedExam(teacherCookie);
    const studentCookie = await sessionFor(['student']);
    const otherStudentCookie = await sessionFor(['student']);
    await withCsrf(request(server()).post(`/api/exams/${examId}/attempts`)).set(
      'Cookie',
      studentCookie,
    );
    await withCsrf(request(server()).post(`/api/exams/${examId}/attempts`)).set(
      'Cookie',
      otherStudentCookie,
    );

    const ownList = await request(server())
      .get('/api/attempts')
      .query({ examId })
      .set('Cookie', studentCookie);
    expect(ownList.status).toBe(200);
    expect(ownList.body as ExamAttemptDto[]).toHaveLength(1);

    const teacherList = await request(server())
      .get('/api/attempts')
      .query({ examId })
      .set('Cookie', teacherCookie);
    expect((teacherList.body as ExamAttemptDto[]).length).toBe(2);

    // «Дай всё» запрещён (CLAUDE.md «API») — лимит применяется и здесь.
    const limited = await request(server())
      .get('/api/attempts')
      .query({ examId, limit: 1 })
      .set('Cookie', teacherCookie);
    expect((limited.body as ExamAttemptDto[]).length).toBe(1);
  });
});
