// e2e на текст ошибок валидации (CLAUDE.md «Ошибки»): один запрос с
// несколькими проблемами разом — details[] по-русски, с подписями полей
// из FIELD_LABELS_RU (shared), включая вложенное правило расписания
// (ClassFieldsDto.rules → ScheduleRuleDto) и неизвестное поле формы
// (forbidNonWhitelisted, app.setup.ts). Реальный AppModule — та же цепочка
// ValidationPipe → exceptionFactory → DomainExceptionFilter, что видит браузер.
import request from 'supertest';
import type { ApiErrorBody } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Тексты ошибок валидации (e2e)', () => {
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

  it('POST /classes с пятью проблемами разом — details по-русски, каждая своей строкой', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await withCsrf(request(server()).post('/api/classes'))
      .set('Cookie', cookie)
      .send({
        title: '',
        format: 'online',
        zoomLink: 'http://us02web.zoom.us/j/123',
        rules: [{ weekday: 1, time: '25:99', durationMin: 60 }],
        extraField: 'опечатка формы',
      });

    expect(res.status).toBe(400);
    const body = res.body as ApiErrorBody;
    expect(body.code).toBe('invalid_input');
    expect(body.message).toBe('Проверьте, пожалуйста, введённые данные.');
    expect(body.details).toEqual(
      expect.arrayContaining([
        'Название: заполните поле.',
        'Ссылка Zoom: должна начинаться с https://.',
        'Правило 1, Время: в формате ЧЧ:ММ, например 19:00.',
        'extraField: поле не поддерживается.',
      ]),
    );
    // Ни одной строки на латинице camelCase/HTML-мусора class-validator —
    // весь details целиком прошёл через маппер, не только часть строк.
    expect(body.details?.some((line) => /^[a-zA-Z]+ must/.test(line))).toBe(false);
  });

  it('POST /auth/telegram с лишним полем виджета — 200, не 400 (свой пайп без forbidNonWhitelisted)', async () => {
    // Регрессия на исключение из app.setup.ts: у auth-telegram.e2e-spec.ts
    // уже есть такой тест на успех входа — здесь только форма details, если
    // бы поведение сломалось, проверяет сам факт (не дублирует подпись HMAC).
    const res = await request(server())
      .post('/api/auth/telegram')
      .set('x-requested-with', 'fetch')
      .send({
        id: 1,
        first_name: 'x',
        auth_date: 1,
        chat_instance: 'поле, которого нет в TelegramLoginDto',
        // Валидный по формату (64 hex-символа), но заведомо неверный как
        // подпись — до сверки подписи должны дойти (не 400 от ValidationPipe).
        hash: 'a'.repeat(64),
      });

    // Подпись заведомо неверна (не HMAC от реальных полей) — 401, не 400:
    // подтверждает, что лишних 400 от forbidNonWhitelisted тут нет вовсе,
    // запрос дошёл до проверки подписи.
    expect(res.status).toBe(401);
  });
});
