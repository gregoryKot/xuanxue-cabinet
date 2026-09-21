// e2e проверки работ (слой 4.6, ADR-0022): карточка проверки и оценка —
// только у учителя, ученику этот маршрут закрыт вовсе, а в его собственный
// ответ не уходят ни правильные варианты, ни критерии проверки вопросов. Настоящий AppModule на MongoMemoryServer.
import type {
  AttemptReviewDto,
  ExamAttemptDto,
  ExamDto,
  ExamItemDto,
  MyExamDto,
} from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Проверка работ (e2e)', () => {
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

  async function publishedExam(teacherCookie: string): Promise<ExamDto> {
    const item = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', teacherCookie)
      .send({
        kind: 'text',
        prompt: 'Опишите форму «пэнбу»',
        criteria: 'Смотреть на колено и центр тяжести',
      });
    const itemId = (item.body as ExamItemDto).id;
    await withCsrf(request(server()).patch(`/api/exam-items/${itemId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });

    const created = await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', teacherCookie)
      .send({ title: 'Первый уровень', blocks: [{ itemIds: [itemId] }] });
    const examId = (created.body as ExamDto).id;
    const published = await withCsrf(request(server()).patch(`/api/exams/${examId}`))
      .set('Cookie', teacherCookie)
      .send({ status: 'published' });
    return published.body as ExamDto;
  }

  async function submittedAttempt(
    examId: string,
    studentCookie: string,
  ): Promise<ExamAttemptDto> {
    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);
    const attempt = started.body as ExamAttemptDto;
    const submitted = await withCsrf(
      request(server()).post(`/api/attempts/${attempt.id}/submit`),
    ).set('Cookie', studentCookie);
    return submitted.body as ExamAttemptDto;
  }

  it('ученику карточка проверки и выставление оценки закрыты', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const exam = await publishedExam(teacherCookie);
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const attempt = await submittedAttempt(exam.id, studentCookie);

    const review = await request(server())
      .get(`/api/attempts/${attempt.id}/review`)
      .set('Cookie', studentCookie);
    const grading = await withCsrf(
      request(server()).put(`/api/attempts/${attempt.id}/grading`),
    )
      .set('Cookie', studentCookie)
      .send({ outcome: 'passed' });

    expect(review.status).toBe(403);
    expect(grading.status).toBe(403);
  });

  it('тело без outcome или с недопустимым значением outcome — 400', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const exam = await publishedExam(teacherCookie);
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const attempt = await submittedAttempt(exam.id, studentCookie);

    const withoutOutcome = await withCsrf(
      request(server()).put(`/api/attempts/${attempt.id}/grading`),
    )
      .set('Cookie', teacherCookie)
      .send({ comment: 'Без итога' });
    const badOutcome = await withCsrf(
      request(server()).put(`/api/attempts/${attempt.id}/grading`),
    )
      .set('Cookie', teacherCookie)
      .send({ outcome: 'excellent' });

    expect(withoutOutcome.status).toBe(400);
    expect(badOutcome.status).toBe(400);
  });

  it('учитель видит критерии проверки вопроса, ставит итог с комментарием; ученик видит результат без критериев вопроса', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const exam = await publishedExam(teacherCookie);
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик Петров',
      roles: [],
    });
    const attempt = await submittedAttempt(exam.id, studentCookie);

    const review = await request(server())
      .get(`/api/attempts/${attempt.id}/review`)
      .set('Cookie', teacherCookie);
    expect(review.status).toBe(200);
    const reviewBody = review.body as AttemptReviewDto;
    expect(reviewBody.userName).toBe('Ученик Петров'); // не голый userId (слой 4.6)
    const question = reviewBody.blocks[0]?.questions[0];
    expect(question?.criteria).toBe('Смотреть на колено и центр тяжести');

    const graded = await withCsrf(
      request(server()).put(`/api/attempts/${attempt.id}/grading`),
    )
      .set('Cookie', teacherCookie)
      .send({ comment: 'Хорошая работа, держите центр.', outcome: 'passed' });
    expect(graded.status).toBe(200);
    expect((graded.body as AttemptReviewDto).grading?.outcome).toBe('passed');
    const reviewAfterGrading = await request(server())
      .get(`/api/attempts/${attempt.id}/review`)
      .set('Cookie', teacherCookie);
    expect(graded.body).toEqual(reviewAfterGrading.body); // ADR-0087: тело = GET сразу после

    const mine = await request(server())
      .get('/api/me/exams')
      .set('Cookie', studentCookie);
    const own = (mine.body as MyExamDto[]).find((item) => item.id === exam.id);
    expect(own?.lastAttempt?.outcome).toBe('passed');
    expect(own?.lastAttempt?.comment).toBe('Хорошая работа, держите центр.');
    // Критерии проверки вопроса — только учителю: в ответе ученику их нет
    // нигде, ни в одном поле (инвариант ADR-0022).
    expect(JSON.stringify(mine.body)).not.toContain('Смотреть на колено');
  });

  it('в списке попыток учитель видит outcome/gradedAt проверенной работы, ученик их не видит вовсе', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const exam = await publishedExam(teacherCookie);
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const attempt = await submittedAttempt(exam.id, studentCookie);

    await withCsrf(request(server()).put(`/api/attempts/${attempt.id}/grading`))
      .set('Cookie', teacherCookie)
      .send({ outcome: 'passed' });

    const teacherList = await request(server())
      .get('/api/attempts')
      .query({ examId: exam.id })
      .set('Cookie', teacherCookie);
    const listed = (teacherList.body as ExamAttemptDto[]).find(
      (item) => item.id === attempt.id,
    );
    expect(listed?.outcome).toBe('passed');
    expect(typeof listed?.gradedAt).toBe('string');

    // Своя попытка ученика — поля физически отсутствуют в ответе (SECURITY
    // §3), не приходят пустыми: свой итог он видит на «Заданиях», `GET /me/exams`.
    const studentList = await request(server())
      .get('/api/attempts')
      .query({ examId: exam.id })
      .set('Cookie', studentCookie);
    const own = (studentList.body as Record<string, unknown>[])[0];
    expect(own).not.toHaveProperty('outcome');
    expect(own).not.toHaveProperty('gradedAt');
  });

  it('повторная оценка переписывает прежнюю, второй записи не появляется', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const exam = await publishedExam(teacherCookie);
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const attempt = await submittedAttempt(exam.id, studentCookie);

    async function grade(outcome: string): Promise<AttemptReviewDto> {
      const res = await withCsrf(
        request(server()).put(`/api/attempts/${attempt.id}/grading`),
      )
        .set('Cookie', teacherCookie)
        .send({ outcome });
      return res.body as AttemptReviewDto;
    }

    const first = await grade('needs_work');
    const second = await grade('passed');

    expect(second.grading?.id).toBe(first.grading?.id); // апдейт, не вторая запись
    const after = await request(server())
      .get(`/api/attempts/${attempt.id}/review`)
      .set('Cookie', teacherCookie);
    expect((after.body as AttemptReviewDto).grading?.outcome).toBe('passed');
  });
});
