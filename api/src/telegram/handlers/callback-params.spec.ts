// Параметр кнопки приходит снаружи: его может подделать кто угодно, кто видел
// callback data (CLAUDE.md «Telegram»: параметры валидируются). Чистая
// функция — проверяется без Telegram и без Mongo.
import { isValidCallbackParam } from './callback-params';

const OBJECT_ID = '000000000000000000000000';

describe('isValidCallbackParam', () => {
  it.each([
    ['cancel', OBJECT_ID],
    ['topic', OBJECT_ID],
    ['norec', OBJECT_ID],
    ['sent', OBJECT_ID],
    ['exam', OBJECT_ID],
    ['es', OBJECT_ID],
  ] as const)('%s — ObjectId подходит', (action, id) => {
    expect(isValidCallbackParam(action, id)).toBe(true);
  });

  it.each([
    ['cancel', 'не-objectid'],
    ['notif', 'нет-такого-вида'],
    ['menu', 'нет-такого-экрана'],
    ['eq', `${OBJECT_ID}:минус-один`],
    ['eo', OBJECT_ID],
  ] as const)('%s — битый параметр не проходит', (action, id) => {
    expect(isValidCallbackParam(action, id)).toBe(false);
  });

  it('notif — вид уведомления, не ObjectId', () => {
    expect(isValidCallbackParam('notif', 'lesson_soon')).toBe(true);
    expect(isValidCallbackParam('notif', OBJECT_ID)).toBe(false);
  });

  it('menu — экран меню, не ObjectId', () => {
    expect(isValidCallbackParam('menu', 'back')).toBe(true);
  });

  it('eq/eo — попытка и номера', () => {
    expect(isValidCallbackParam('eq', `${OBJECT_ID}:0`)).toBe(true);
    expect(isValidCallbackParam('eo', `${OBJECT_ID}:0:2`)).toBe(true);
  });
});
