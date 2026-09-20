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
    expect(isValidCallbackParam('notif', 'post_draft')).toBe(true);
    expect(isValidCallbackParam('notif', OBJECT_ID)).toBe(false);
  });

  it('menu — экран меню, не ObjectId', () => {
    expect(isValidCallbackParam('menu', 'back')).toBe(true);
  });

  it('eq/eo — попытка и номера', () => {
    expect(isValidCallbackParam('eq', `${OBJECT_ID}:0`)).toBe(true);
    expect(isValidCallbackParam('eo', `${OBJECT_ID}:0:2`)).toBe(true);
  });

  // ТЗ 4б.3 (docs/PLAN.md §12) — «Новый вопрос»: nqk (тип), nqo (номер
  // варианта), nqd (какой шаг завершают), nqf (что делает диалог дальше).
  it('nqk — известный ExamItemKind, не что попало', () => {
    expect(isValidCallbackParam('nqk', 'single')).toBe(true);
    expect(isValidCallbackParam('nqk', 'нет-такого-типа')).toBe(false);
  });

  it('nqo — номер варианта (целое неотрицательное), не что попало', () => {
    expect(isValidCallbackParam('nqo', '0')).toBe(true);
    expect(isValidCallbackParam('nqo', '3')).toBe(true);
    expect(isValidCallbackParam('nqo', '-1')).toBe(false);
    expect(isValidCallbackParam('nqo', 'не-число')).toBe(false);
  });

  it('nqd — только «options»/«correct»', () => {
    expect(isValidCallbackParam('nqd', 'options')).toBe(true);
    expect(isValidCallbackParam('nqd', 'correct')).toBe(true);
    expect(isValidCallbackParam('nqd', 'нет-такого-шага')).toBe(false);
  });

  it('nqf — только «skip»/«save»/«cancel»', () => {
    expect(isValidCallbackParam('nqf', 'skip')).toBe(true);
    expect(isValidCallbackParam('nqf', 'save')).toBe(true);
    expect(isValidCallbackParam('nqf', 'cancel')).toBe(true);
    expect(isValidCallbackParam('nqf', 'нет-такого-действия')).toBe(false);
  });

  // ТЗ 4б.4 (docs/PLAN.md §12) — «Собрать экзамен»: net (отметка вопроса,
  // ObjectId — default-ветка ниже), nep (страница), nea (перейти дальше),
  // nel (лимит времени), nen (число попыток), nef (что делает диалог дальше).
  it('net — ObjectId вопроса, как cancel/topic/sent', () => {
    expect(isValidCallbackParam('net', OBJECT_ID)).toBe(true);
    expect(isValidCallbackParam('net', 'не-objectid')).toBe(false);
  });

  it('nep — только «prev»/«next»', () => {
    expect(isValidCallbackParam('nep', 'prev')).toBe(true);
    expect(isValidCallbackParam('nep', 'next')).toBe(true);
    expect(isValidCallbackParam('nep', 'нет-такой-страницы')).toBe(false);
  });

  it('nea — только «go»', () => {
    expect(isValidCallbackParam('nea', 'go')).toBe(true);
    expect(isValidCallbackParam('nea', 'нет-такого-действия')).toBe(false);
  });

  it('nel — только «none»/«15»/«30»/«60»', () => {
    expect(isValidCallbackParam('nel', 'none')).toBe(true);
    expect(isValidCallbackParam('nel', '30')).toBe(true);
    expect(isValidCallbackParam('nel', '45')).toBe(false);
  });

  it('nen — только «1»/«2»/«3»', () => {
    expect(isValidCallbackParam('nen', '1')).toBe(true);
    expect(isValidCallbackParam('nen', '3')).toBe(true);
    expect(isValidCallbackParam('nen', '4')).toBe(false);
  });

  it('nef — только «cancel»/«publish»', () => {
    expect(isValidCallbackParam('nef', 'cancel')).toBe(true);
    expect(isValidCallbackParam('nef', 'publish')).toBe(true);
    expect(isValidCallbackParam('nef', 'нет-такого-действия')).toBe(false);
  });
});
