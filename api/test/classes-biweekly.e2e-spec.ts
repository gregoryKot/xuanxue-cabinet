// e2e на правило «раз в две недели» (ADR-0168) — отдельный файл от
// classes.e2e-spec.ts, тот же приём, что у classes-tags.e2e-spec.ts. Доступ к
// /classes по роли и 401/403 держит classes.e2e-spec.ts; здесь — что правило
// доходит до базы и обратно и что неверная пара «как часто / дата» не
// сохраняется. Настоящий AppModule на MongoMemoryServer.
import { Types } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, ClassDto, ScheduleRuleDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createLessonTestHelpers } from './e2e-support/lessons-fixtures';

const BIWEEKLY_RULE = {
  weekday: 5,
  time: '20:00',
  durationMin: 90,
  everyWeeks: 2,
  startsOn: '2026-10-02',
};
const VALID_BODY = {
  title: 'Для преподавателей',
  format: 'online' as const,
  rules: [BIWEEKLY_RULE],
};

describe('Занятие раз в две недели (e2e, ADR-0168)', () => {
  let testApp: TestApp;
  const { server, sessionFor, classModel, lessonModel } = createLessonTestHelpers(
    () => testApp,
  );

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await lessonModel().deleteMany({});
    await classModel().deleteMany({});
  });

  function postClass(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/classes'))
      .set('Cookie', cookie)
      .send(body);
  }

  function patchClass(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/classes/${id}`))
      .set('Cookie', cookie)
      .send(body);
  }

  function ruleOf(res: request.Response): ScheduleRuleDto | undefined {
    return (res.body as ClassDto).rules[0];
  }

  it('создание → GET: everyWeeks и startsOn вернулись как записаны', async () => {
    const cookie = await sessionFor(['teacher']);

    const created = await postClass(cookie, VALID_BODY);

    expect(created.status).toBe(201);
    expect(ruleOf(created)).toMatchObject({ everyWeeks: 2, startsOn: '2026-10-02' });
    const got = await request(server())
      .get(`/api/classes/${(created.body as ClassDto).id}`)
      .set('Cookie', cookie);
    expect(ruleOf(got)).toMatchObject({ everyWeeks: 2, startsOn: '2026-10-02' });
  });

  it('PATCH правил обратно на «каждую неделю»: ни everyWeeks, ни startsOn в ответе и в базе', async () => {
    const cookie = await sessionFor(['teacher']);
    const created = await postClass(cookie, VALID_BODY);
    const dto = created.body as ClassDto;

    const patched = await patchClass(cookie, dto.id, {
      rules: [{ id: ruleOf(created)?.id, weekday: 5, time: '20:00', durationMin: 90 }],
    });

    expect(patched.status).toBe(200);
    expect(ruleOf(patched)?.id).toBe(ruleOf(created)?.id); // id правила тот же
    expect(patched.body as ClassDto).toMatchObject({ id: dto.id });
    const rule = ruleOf(patched) as unknown as Record<string, unknown>;
    expect(rule).not.toHaveProperty('everyWeeks');
    expect(rule).not.toHaveProperty('startsOn');
    const raw = await classModel().collection.findOne<{ rules: object[] }>({
      _id: new Types.ObjectId(dto.id),
    });
    expect(raw?.rules[0]).not.toHaveProperty('startsOn');
    expect(raw?.rules[0]).not.toHaveProperty('everyWeeks');
  });

  it('PATCH правил на «раз в две недели» меняет и ответ, и повторный GET', async () => {
    const cookie = await sessionFor(['teacher']);
    const created = await postClass(cookie, {
      ...VALID_BODY,
      rules: [{ weekday: 5, time: '20:00', durationMin: 90 }],
    });
    const dto = created.body as ClassDto;

    const patched = await patchClass(cookie, dto.id, { rules: [BIWEEKLY_RULE] });

    expect(ruleOf(patched)).toMatchObject({ everyWeeks: 2, startsOn: '2026-10-02' });
    const got = await request(server())
      .get(`/api/classes/${dto.id}`)
      .set('Cookie', cookie);
    expect(ruleOf(got)).toMatchObject({ everyWeeks: 2, startsOn: '2026-10-02' });
  });

  it('everyWeeks: 2 без даты — 400 с понятным текстом, класс не создан', async () => {
    const cookie = await sessionFor(['teacher']);
    const { startsOn: _startsOn, ...withoutDate } = BIWEEKLY_RULE;

    const res = await postClass(cookie, { ...VALID_BODY, rules: [withoutDate] });

    expect(res.status).toBe(400);
    const body = res.body as ApiErrorBody;
    expect(body.code).toBe('invalid_input');
    expect(body.message).toBe(
      'Правило 1: Впишите дату первого занятия: от неё занятие идёт через неделю.',
    );
    expect(await classModel().countDocuments({})).toBe(0);
  });

  it('дата в другой день недели — 400, PATCH не меняет прежние правила', async () => {
    const cookie = await sessionFor(['teacher']);
    const created = await postClass(cookie, VALID_BODY);
    const dto = created.body as ClassDto;

    const res = await patchClass(cookie, dto.id, {
      rules: [{ ...BIWEEKLY_RULE, startsOn: '2026-10-03' }],
    });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).message).toBe(
      'Правило 1: Дата первого занятия выпадает на субботу, а правило стоит на пятницу. Выберите пятницу.',
    );
    const got = await request(server())
      .get(`/api/classes/${dto.id}`)
      .set('Cookie', cookie);
    expect(ruleOf(got)).toMatchObject({ startsOn: '2026-10-02' });
  });

  it('everyWeeks вне {1, 2} и дата не в формате ГГГГ-ММ-ДД — 400 из DTO с подписями полей', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await postClass(cookie, {
      ...VALID_BODY,
      rules: [{ ...BIWEEKLY_RULE, everyWeeks: 3, startsOn: '02.10.2026' }],
    });

    expect(res.status).toBe(400);
    const details = (res.body as ApiErrorBody).details ?? [];
    expect(details).toContain('Правило 1, Как часто: допустимые значения: 1, 2.');
    expect(details).toContain(
      'Правило 1, Первое занятие: в формате ГГГГ-ММ-ДД, например 2026-10-02.',
    );
  });

  it('everyWeeks: null — 400, а не «сбросить»: правила заменяются целиком', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await postClass(cookie, {
      ...VALID_BODY,
      rules: [{ ...BIWEEKLY_RULE, everyWeeks: null }],
    });

    expect(res.status).toBe(400);
  });
});
