// Гипотеза владельца школы: добавленный вопрос в блок формы не доезжает до
// предпросмотра и до учеников. Read-after-write через настоящие точки входа
// (CLAUDE.md «Тесты»): PATCH добавляет вопрос в уже существующий
// blocks[].itemIds, отдельный GET (не ответ PATCH) проверяет, что он там
// остался — если сервер отдаёт вопрос честно, причина не здесь. Отдельный
// файл, а не рост exams.e2e-spec.ts: тот уже сверх мягкого предела
// храповика размера (CLAUDE.md «Храповики»), тот же приём, что у
// exam-questions-per-attempt.e2e-spec.ts рядом.
import type { ExamDto, ExamItemDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createExamAttemptsTestHelpers } from './e2e-support/exam-attempts-fixtures';
import { withCsrf } from './e2e-support/http';

describe('Экзамен: вопрос в существующем блоке, read-after-write (e2e)', () => {
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

  // Вопрос заводится как в браузере — сразу опубликованным (ADR-0033), без
  // отдельного шага «опубликовать» в банке.
  async function createItem(cookie: string, prompt: string): Promise<string> {
    const res = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', cookie)
      .send({ kind: 'text', prompt });
    expect(res.status).toBe(201);
    return (res.body as ExamItemDto).id;
  }

  function patchExam(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/exams/${id}`))
      .set('Cookie', cookie)
      .send(body);
  }

  async function getExam(cookie: string, id: string): Promise<ExamDto> {
    const res = await request(server()).get(`/api/exams/${id}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body as ExamDto;
  }

  it('черновик: PATCH добавляет вопрос в существующий блок — отдельный GET видит оба', async () => {
    const cookie = await sessionFor(['teacher']);
    const firstId = await createItem(cookie, 'Первый вопрос');
    const secondId = await createItem(cookie, 'Второй вопрос');

    const created = await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', cookie)
      .send({ title: 'Экзамен по третьей форме', blocks: [{ itemIds: [firstId] }] });
    expect(created.status).toBe(201);
    const dto = created.body as ExamDto;
    const blockId = dto.blocks[0]?.id;
    expect(typeof blockId).toBe('string');

    const patched = await patchExam(cookie, dto.id, {
      blocks: [{ id: blockId, title: '', itemIds: [firstId, secondId], shuffle: false }],
    });
    expect(patched.status).toBe(200);

    // Смысл теста — отдельный GET, не ответ PATCH: ровно та гипотеза, что
    // добавленный вопрос не доезжает именно до предпросмотра/учеников.
    const read = await getExam(cookie, dto.id);
    expect(read.blocks[0]?.itemIds).toEqual([firstId, secondId]);
  });

  it('опубликованная форма: PATCH добавляет второй опубликованный вопрос — сохраняется и читается', async () => {
    const cookie = await sessionFor(['teacher']);
    const { examId, itemId: firstId } = await createPublishedExam(cookie);
    const secondId = await createItem(cookie, 'Второй вопрос формы');

    const before = await getExam(cookie, examId);
    const blockId = before.blocks[0]?.id;
    expect(before.status).toBe('published');
    expect(typeof blockId).toBe('string');

    // Сохранение уже опубликованной формы проходит assertPublishable
    // (exams.service.ts) — тот же путь, что у блокера аудита №3
    // (exam-published-invariant.e2e-spec.ts), но с непустыми blocks.
    const patched = await patchExam(cookie, examId, {
      blocks: [{ id: blockId, title: '', itemIds: [firstId, secondId], shuffle: false }],
    });
    expect(patched.status).toBe(200);

    const read = await getExam(cookie, examId);
    expect(read.status).toBe('published');
    expect(read.blocks[0]?.itemIds).toEqual([firstId, secondId]);
  });

  it('61 вопрос в блоке: PATCH добавляет последний — GET возвращает все 61 по порядку', async () => {
    const cookie = await sessionFor(['teacher']);
    const itemIds: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      itemIds.push(await createItem(cookie, `Вопрос ${i + 1}`));
    }

    const created = await withCsrf(request(server()).post('/api/exams'))
      .set('Cookie', cookie)
      .send({ title: 'Форма 1. Целостная собранность', blocks: [{ itemIds }] });
    expect(created.status).toBe(201);
    const dto = created.body as ExamDto;
    const blockId = dto.blocks[0]?.id;
    expect(dto.blocks[0]?.itemIds).toHaveLength(60);

    const lastId = await createItem(cookie, 'Вопрос 61');
    const allIds = [...itemIds, lastId];

    // itemsPerBlockMax — 100 (shared/src/exams.ts, ADR-0064): 61 внутри
    // лимита. Гипотеза — не лимит списка и не шифрование blocks (encJson,
    // exam.schema.ts) режут длинный массив на сохранении или на чтении.
    const patched = await patchExam(cookie, dto.id, {
      blocks: [{ id: blockId, title: '', itemIds: allIds, shuffle: false }],
    });
    expect(patched.status).toBe(200);

    const read = await getExam(cookie, dto.id);
    expect(read.blocks[0]?.itemIds).toEqual(allIds);
    expect(read.blocks[0]?.itemIds).toHaveLength(61);
  });
});
