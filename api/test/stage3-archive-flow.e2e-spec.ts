// Критерий готовности этапа 3 (docs/PLAN.md §5 и §14) одним сквозным
// сценарием: **ученик находит запись прошлого занятия без вопроса в чат**.
// Весь путь идёт через настоящий API на MongoMemoryServer — учитель заводит
// занятие и отдаёт запись, ученик забирает её из архива и библиотеки. Ни
// одной прямой правки базы: если шаг нельзя пройти через кабинет, этот тест
// первым это покажет (тот же приём, что у exam-full-flow.e2e-spec.ts).
import type { MyArchivedLessonDto, MyMaterialDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const RECORDING_URL = 'https://cloud.example/lesson-2026-09-15';
const MATERIAL_URL = 'https://example.com/wang-peisheng';
const LESSON_TOPIC = 'Форма 24, первая треть';

describe('Этап 3: ученик находит запись прошлого занятия (e2e)', () => {
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

  it('учитель провёл занятие и отдал запись — ученик открывает её у себя', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const student = await sessionCookieFor(testApp.app, []);

    // 1. Учитель заводит занятие расписания и разовую дату в прошлом —
    // ровно то, что происходит, когда занятие уже прошло.
    const createdClass = await withCsrf(request(server()).post('/api/classes'))
      .set('Cookie', teacher)
      .send({
        title: 'Тайцзицюань, средняя группа',
        groupLabel: 'Средняя',
        format: 'online',
        rules: [{ weekday: 2, time: '19:00', durationMin: 60 }],
      });
    expect(createdClass.status).toBe(201);
    const classId = (createdClass.body as { id: string }).id;

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const createdLesson = await withCsrf(request(server()).post('/api/lessons'))
      .set('Cookie', teacher)
      .send({ classId, startsAt: hourAgo, topic: LESSON_TOPIC });
    expect(createdLesson.status).toBe(201);
    const lessonId = (createdLesson.body as { id: string }).id;

    // 2. Учитель отдаёт запись — тем же запросом, каким её кладёт бот после
    // «Запись?» (docs/PLAN.md §6).
    const addRecording = await withCsrf(
      request(server()).post(`/api/lessons/${lessonId}/recording`),
    )
      .set('Cookie', teacher)
      .send({ title: 'Занятие целиком', url: RECORDING_URL });
    expect(addRecording.status).toBe(201);

    // 3. Ученик открывает архив и находит занятие по дате и теме, а запись —
    // готовой ссылкой. Это и есть критерий этапа.
    const archive = await request(server())
      .get('/api/me/lessons/archive')
      .set('Cookie', student);
    expect(archive.status).toBe(200);
    const archived = (archive.body as MyArchivedLessonDto[]).find(
      (lesson) => lesson.id === lessonId,
    );
    expect(archived?.topic).toBe(LESSON_TOPIC);
    expect(archived?.classTitle).toBe('Тайцзицюань, средняя группа');
    expect(archived?.recordings).toEqual([
      { title: 'Занятие целиком', url: RECORDING_URL },
    ]);

    // 4. Материал из библиотеки ученик видит там же — с названием занятия,
    // к которому учитель его привязал (ADR-0047).
    const createdMaterial = await withCsrf(request(server()).post('/api/materials'))
      .set('Cookie', teacher)
      .send({
        title: 'Ван Пэйшэн об усилии',
        url: MATERIAL_URL,
        kind: 'book',
        classIds: [classId],
      });
    expect(createdMaterial.status).toBe(201);

    const library = await request(server())
      .get('/api/me/materials')
      .set('Cookie', student);
    expect(library.status).toBe(200);
    const material = (library.body as MyMaterialDto[]).find(
      (item) => item.title === 'Ван Пэйшэн об усилии',
    );
    expect(material?.url).toBe(MATERIAL_URL);
    expect(material?.classTitles).toEqual(['Тайцзицюань, средняя группа']);

    // 5. Школа включает доступ по оплате и помечает материал — ссылка
    // пропадает у ученика, занятие с записью остаётся открытым (ADR-0048:
    // архив под рубильник не идёт).
    const materialId = (createdMaterial.body as { id: string }).id;
    await withCsrf(request(server()).patch(`/api/materials/${materialId}`))
      .set('Cookie', teacher)
      .send({ access: 'paid' });
    const switched = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', teacher)
      .send({ materialsPaidAccess: true });
    expect(switched.status).toBe(200);

    const closedLibrary = await request(server())
      .get('/api/me/materials')
      .set('Cookie', student);
    const closed = (closedLibrary.body as MyMaterialDto[]).find(
      (item) => item.title === 'Ван Пэйшэн об усилии',
    );
    expect(closed?.locked).toBe(true);
    expect(JSON.stringify(closedLibrary.body)).not.toContain(MATERIAL_URL);

    const archiveAfter = await request(server())
      .get('/api/me/lessons/archive')
      .set('Cookie', student);
    expect(JSON.stringify(archiveAfter.body)).toContain(RECORDING_URL);
  });
});
