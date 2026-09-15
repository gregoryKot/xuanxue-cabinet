// e2e на решения ADR-0033 («экзамен для учителя — список вопросов»): флаг
// формы `shuffleOptions`, исчезнувший из контракта `required` у блока и
// вопрос банка, годный к сборке формы сразу. Своим файлом, а не дописками в
// exams/exam-items/exam-attempts.e2e-spec.ts: те уже у потолка файл-храповика
// (CLAUDE.md «Храповики»), да и читается одно решение целиком.
import type { ApiErrorBody, ExamAttemptDto, ExamDto, ExamItemDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createExamAttemptsTestHelpers } from './e2e-support/exam-attempts-fixtures';
import { withCsrf } from './e2e-support/http';

const VALID_BODY = { title: 'Экзамен по третьей форме' };

describe('Экзамен как список вопросов (e2e, ADR-0033)', () => {
  let testApp: TestApp;
  const { server, sessionFor, createPublishedExam } = createExamAttemptsTestHelpers(
    () => testApp,
  );

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function postExam(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', cookie)
      .send(body);
  }

  async function createPublishedItem(cookie: string): Promise<string> {
    const res = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', cookie)
      .send({ kind: 'text', prompt: 'Опишите стойку мабу' });
    return (res.body as ExamItemDto).id;
  }

  it('вопрос банка создаётся опубликованным — сразу годен для формы', async () => {
    const cookie = await sessionFor(['teacher']);

    const itemId = await createPublishedItem(cookie);
    const got = await request(server())
      .get(`/api/exam-items/${itemId}`)
      .set('Cookie', cookie);
    expect((got.body as ExamItemDto).status).toBe('published');

    // Ровно то, чего не хватало владельцу: только что заведённый вопрос
    // ставится в форму без отдельного шага «опубликовать».
    const exam = await postExam(cookie, {
      ...VALID_BODY,
      blocks: [{ itemIds: [itemId] }],
    });
    expect(exam.status).toBe(201);
  });

  it('POST со status: draft — вопрос остаётся спрятанным', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', cookie)
      .send({ kind: 'text', prompt: 'Пока прячу', status: 'draft' });

    expect(res.status).toBe(201);
    expect((res.body as ExamItemDto).status).toBe('draft');
  });

  it('shuffleOptions: по умолчанию false, приходит в ответе и меняется PATCH', async () => {
    const cookie = await sessionFor(['teacher']);
    const created = await postExam(cookie, VALID_BODY);
    const dto = created.body as ExamDto;
    expect(dto.shuffleOptions).toBe(false);

    const patched = await withCsrf(request(server()).patch(`/api/exams/${dto.id}`))
      .set('Cookie', cookie)
      .send({ shuffleOptions: true });
    expect(patched.status).toBe(200);
    expect((patched.body as ExamDto).shuffleOptions).toBe(true);

    const got = await request(server()).get(`/api/exams/${dto.id}`).set('Cookie', cookie);
    expect((got.body as ExamDto).shuffleOptions).toBe(true);
  });

  // «Блок обязателен» ушло из контракта, а пайп стоит с forbidNonWhitelisted
  // (app.setup.ts): вкладка со старым бандлом получит 400, а не тихое
  // сохранение мимо смысла. Фиксируем — чтобы не оказалось сюрпризом.
  it('блок с required от старого клиента — 400, форма не создаётся', async () => {
    const cookie = await sessionFor(['teacher']);
    const itemId = await createPublishedItem(cookie);

    const res = await postExam(cookie, {
      ...VALID_BODY,
      blocks: [{ itemIds: [itemId], required: true }],
    });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });

  // Перемешивание вариантов применяется один раз, при старте, в снимок.
  // Проверяем состав, а не конкретный порядок: «порядок другой» на настоящей
  // случайности мигал бы (CLAUDE.md «Детерминизм»).
  it('старт на форме с shuffleOptions — тот же набор вариантов, порядок из снимка', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const { examId, optionIds } = await createPublishedExam(teacherCookie, {
      shuffleOptions: true,
    });
    const studentCookie = await sessionFor([]);

    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);

    expect(started.status).toBe(201);
    const shown = (started.body as ExamAttemptDto).blocks[0]?.questions[0]?.options ?? [];
    expect(shown.map((option) => option.id).sort()).toEqual([...optionIds].sort());

    // Снимок не пересобирается на каждое чтение — порядок тот же, что при старте.
    const again = await request(server())
      .get('/api/attempts')
      .set('Cookie', studentCookie);
    expect((again.body as ExamAttemptDto[])[0]?.blocks[0]?.questions[0]?.options).toEqual(
      shown,
    );
  });
});
