// e2e «Новый материал» (ADR-0162, п. 4) на настоящем AppModule: read-after-write через
// четыре точки входа. Ученик включает вид в PATCH /me/notifications (он «по желанию»,
// в дефолте его нет), учитель создаёт материал POST-ом /materials с галочкой
// `notifyStudents`, тик планировщика сообщает об этом (шаг вызывается напрямую: cron в
// e2e выключен, SCHEDULER_ENABLED=false), а ученик читает ленту в GET /me/inbox. Ни одна
// точка не подглядывает в базу мимо другой — так ловится расхождение между `announceAt`,
// который ставит создание, и выборкой шага.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { DateTime } from 'luxon';
import type {
  InboxPageDto,
  MaterialDto,
  MyMaterialDto,
  NotificationPrefsDto,
} from '@xuanxue/shared';
import { NOTIFICATION_LABELS } from '@xuanxue/shared';
import { MaterialNewNoticeService } from '../src/materials/material-new-notice.service';
import { MaterialRecord } from '../src/materials/material.schema';
import { NotificationPrefsRecord } from '../src/notifications/notification-prefs.schema';
import { NotificationRecord } from '../src/notifications/notification.schema';
import { USER_MODEL_NAME } from '../src/users/user-data.registry';
import type { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createLessonTestHelpers } from './e2e-support/lessons-fixtures';
import { createUserWithSession } from './e2e-support/session';

const BOOK = {
  title: 'Ван Пэйшэн, «Ба-гуа-чжан»',
  url: 'https://example.com/book',
  kind: 'book',
};

describe('Новый материал — включил → POST материала → тик → лента (e2e)', () => {
  let testApp: TestApp;
  const { server, sessionFor, classModel, createClass } = createLessonTestHelpers(
    () => testApp,
  );

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  // Люди и их настройки тоже чистятся: следующий тест не должен получить в
  // получатели учеников предыдущего — шаг тика пишет всем, кто подходит.
  afterEach(async () => {
    const get = <T>(name: string) =>
      testApp.app.get<Model<T>>(getModelToken(name), { strict: false });
    await Promise.all([
      classModel().deleteMany({}),
      get<MaterialRecord>(MaterialRecord.name).deleteMany({}),
      get<NotificationRecord>(NotificationRecord.name).deleteMany({}),
      get<NotificationPrefsRecord>(NotificationPrefsRecord.name).deleteMany({}),
      get<UserRecord>(USER_MODEL_NAME).deleteMany({}),
    ]);
  });

  function tick(): Promise<{ notified: number }> {
    return testApp.app
      .get(MaterialNewNoticeService, { strict: false })
      .announce(DateTime.utc());
  }

  async function inboxOf(cookie: string): Promise<InboxPageDto> {
    const res = await request(server()).get('/api/me/inbox').set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body as InboxPageDto;
  }

  async function newStudent(name: string): Promise<string> {
    const { cookie } = await createUserWithSession(testApp.app, { name, roles: [] });
    return cookie;
  }

  /** PATCH /me/notifications — то, что делает переключатель экрана и бот. */
  function switchMaterialNotice(cookie: string, enabled: boolean): request.Test {
    return withCsrf(request(server()).patch('/api/me/notifications'))
      .set('Cookie', cookie)
      .send({ kind: 'material_new', enabled });
  }

  function postMaterial(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/materials'))
      .set('Cookie', cookie)
      .send({ ...BOOK, ...body });
  }

  function patchMaterial(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/materials/${id}`))
      .set('Cookie', cookie)
      .send(body);
  }

  function putScope(cookie: string, classIds: string[]): request.Test {
    return withCsrf(request(server()).put('/api/me/notifications/lessons/scope'))
      .set('Cookie', cookie)
      .send({ mode: 'selected', classIds });
  }

  it('включивший ученик видит материал в ленте, не включавший — нет', async () => {
    const teacher = await sessionFor(['teacher']);
    const eager = await newStudent('Ученик, включивший вид');
    const quiet = await newStudent('Ученик без выбора');

    const before = await request(server())
      .get('/api/me/notifications')
      .set('Cookie', quiet);
    expect((before.body as NotificationPrefsDto).enabled).not.toContain('material_new');
    const on = await switchMaterialNotice(eager, true);
    expect(on.status).toBe(200);
    expect((on.body as NotificationPrefsDto).enabled).toContain('material_new');

    const created = await postMaterial(teacher, { notifyStudents: true });
    expect(created.status).toBe(201);
    // Момент и галочка — детали хранения, наружу они не уходят.
    expect(created.body).not.toHaveProperty('announceAt');
    expect(created.body).not.toHaveProperty('notifyStudents');

    // Создание ленту не трогает: сообщает шаг тика, а не запрос.
    expect((await inboxOf(eager)).items).toEqual([]);
    expect(await tick()).toEqual({ notified: 1 });

    const page = await inboxOf(eager);
    expect(page.unreadCount).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      kind: 'material_new',
      text: `${NOTIFICATION_LABELS.material_new} — ${BOOK.title}`,
    });
    // Ни id материала, ни названия отдельным полем: строка собрана на сервере.
    expect(page.items[0]).not.toHaveProperty('materialTitle');
    expect((await inboxOf(quiet)).items).toEqual([]);
    // И сам материал ученику доступен в библиотеке — строка ведёт не в пустоту.
    const library = await request(server()).get('/api/me/materials').set('Cookie', eager);
    expect((library.body as MyMaterialDto[]).map((m) => m.title)).toContain(BOOK.title);
  });

  it('без галочки и с галочкой, снятой явно, материал не объявляется', async () => {
    const teacher = await sessionFor(['teacher']);
    const cookie = await newStudent('Ученик');
    await switchMaterialNotice(cookie, true);

    expect((await postMaterial(teacher, {})).status).toBe(201);
    expect((await postMaterial(teacher, { notifyStudents: false })).status).toBe(201);

    expect(await tick()).toEqual({ notified: 0 });
    expect((await inboxOf(cookie)).items).toEqual([]);
  });

  it('служебный материал («Только преподаватели») не объявляется, даже с галочкой', async () => {
    const teacher = await sessionFor(['teacher']);
    const cookie = await newStudent('Ученик');
    await switchMaterialNotice(cookie, true);

    const created = await postMaterial(teacher, {
      notifyStudents: true,
      access: 'staff',
    });
    expect(created.status).toBe(201);
    // Позже открыли ученикам — это правка, она не объявляет.
    const opened = await patchMaterial(teacher, (created.body as MaterialDto).id, {
      access: 'all',
    });
    expect(opened.status).toBe(200);

    expect(await tick()).toEqual({ notified: 0 });
    expect((await inboxOf(cookie)).items).toEqual([]);
  });

  it('учитель успел закрыть материал до тика — ученик строки не получает', async () => {
    const teacher = await sessionFor(['teacher']);
    const cookie = await newStudent('Ученик');
    await switchMaterialNotice(cookie, true);
    const created = await postMaterial(teacher, { notifyStudents: true });
    await patchMaterial(teacher, (created.body as MaterialDto).id, { access: 'staff' });

    expect(await tick()).toEqual({ notified: 0 });
    expect((await inboxOf(cookie)).items).toEqual([]);
  });

  it('правка названия уже объявленного материала второй строки не даёт', async () => {
    const teacher = await sessionFor(['teacher']);
    const cookie = await newStudent('Ученик');
    await switchMaterialNotice(cookie, true);
    const created = await postMaterial(teacher, { notifyStudents: true });
    await tick();

    const patched = await patchMaterial(teacher, (created.body as MaterialDto).id, {
      title: 'Опечатка исправлена',
    });
    expect(patched.status).toBe(200);

    expect(await tick()).toEqual({ notified: 0 });
    expect((await inboxOf(cookie)).items).toHaveLength(1);
  });

  it('второй тик строки не дублирует: у ученика в ленте ровно одна', async () => {
    const teacher = await sessionFor(['teacher']);
    const cookie = await newStudent('Ученик');
    await switchMaterialNotice(cookie, true);
    await postMaterial(teacher, { notifyStudents: true });
    await tick();

    expect(await tick()).toEqual({ notified: 0 });

    expect((await inboxOf(cookie)).items).toHaveLength(1);
  });

  describe('кому: занятия и теги материала', () => {
    it('выбравший другое занятие материал этого занятия не получает; выбравший его — получает', async () => {
      const teacher = await sessionFor(['teacher']);
      const thisClass = await createClass();
      const otherClass = await createClass();
      const picky = await newStudent('Ученик с выбором');
      const chosen = await newStudent('Ученик, выбравший занятие');
      for (const cookie of [picky, chosen]) await switchMaterialNotice(cookie, true);
      // PUT отклоняет несуществующие id занятий (400) — выбираем настоящее, но другое.
      expect((await putScope(picky, [otherClass])).status).toBe(200);
      expect((await putScope(chosen, [thisClass])).status).toBe(200);
      const created = await postMaterial(teacher, {
        notifyStudents: true,
        classIds: [thisClass],
      });
      expect(created.status).toBe(201);

      expect(await tick()).toEqual({ notified: 1 });

      expect((await inboxOf(picky)).items).toEqual([]);
      expect((await inboxOf(chosen)).items).toHaveLength(1);
    });

    it('тег материала совпал с тегом занятия (без учёта регистра) — выбравший это занятие получает', async () => {
      const teacher = await sessionFor(['teacher']);
      const tagged = await createClass();
      const other = await createClass();
      const patched = await withCsrf(request(server()).patch(`/api/classes/${tagged}`))
        .set('Cookie', teacher)
        .send({ tags: ['Новички'] });
      expect(patched.status).toBe(200);
      const chosen = await newStudent('Ученик, выбравший занятие');
      const picky = await newStudent('Ученик с другим выбором');
      for (const cookie of [chosen, picky]) await switchMaterialNotice(cookie, true);
      await putScope(chosen, [tagged]);
      await putScope(picky, [other]);
      await postMaterial(teacher, { notifyStudents: true, tags: ['новички', 'книга'] });

      expect(await tick()).toEqual({ notified: 1 });

      expect((await inboxOf(chosen)).items).toHaveLength(1);
      expect((await inboxOf(picky)).items).toEqual([]);
    });
  });

  it('ученик материалов не создаёт: 403, и в ленту ничего не попадает', async () => {
    const cookie = await newStudent('Ученик');
    await switchMaterialNotice(cookie, true);

    const res = await postMaterial(cookie, { notifyStudents: true });
    expect(res.status).toBe(403);

    expect(await tick()).toEqual({ notified: 0 });
    expect((await inboxOf(cookie)).items).toEqual([]);
  });

  it('notifyStudents должен быть булевым, а PATCH поля не знает', async () => {
    const teacher = await sessionFor(['teacher']);

    const bad = await postMaterial(teacher, { notifyStudents: 'да' });
    expect(bad.status).toBe(400);

    const created = await postMaterial(teacher, {});
    const patched = await patchMaterial(teacher, (created.body as MaterialDto).id, {
      notifyStudents: true,
    });
    expect(patched.status).toBe(400);
  });

  it('штат школы ленту о материале не получает, даже включив вид руками', async () => {
    const teacher = await sessionFor(['teacher']);
    await switchMaterialNotice(teacher, true);
    await postMaterial(teacher, { notifyStudents: true });

    expect(await tick()).toEqual({ notified: 0 });
    expect((await inboxOf(teacher)).items).toEqual([]);
  });
});
