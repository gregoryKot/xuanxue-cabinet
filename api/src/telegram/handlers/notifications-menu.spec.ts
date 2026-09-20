// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»): текст и кнопки экрана
// «Уведомления» по ролям и текущему состоянию.
import { buildNotificationsMenu } from './notifications-menu';

describe('buildNotificationsMenu', () => {
  it('учитель, всё включено — четыре вида, кнопки «Выключить»', () => {
    const menu = buildNotificationsMenu(
      ['teacher'],
      ['post_draft', 'recording_request', 'delivery_failed', 'attempt_submitted'],
    );

    expect(menu.text).toContain('Черновик поста — включено');
    expect(menu.text).toContain('Напоминание про запись — включено');
    expect(menu.text).toContain('Пост не ушёл — включено');
    expect(menu.text).toContain('Работа на проверку — включено');
    expect(menu.buttons).toEqual([
      [{ text: 'Выключить: Черновик поста', callback_data: 'notif:post_draft' }],
      [
        {
          text: 'Выключить: Напоминание про запись',
          callback_data: 'notif:recording_request',
        },
      ],
      [{ text: 'Выключить: Пост не ушёл', callback_data: 'notif:delivery_failed' }],
      [
        {
          text: 'Выключить: Работа на проверку',
          callback_data: 'notif:attempt_submitted',
        },
      ],
    ]);
  });

  it('один вид выключен — его кнопка «Включить», текст «выключено»', () => {
    const menu = buildNotificationsMenu(
      ['teacher'],
      ['recording_request', 'delivery_failed', 'attempt_submitted'],
    );

    expect(menu.text).toContain('Черновик поста — выключено');
    expect(menu.buttons[0]).toEqual([
      { text: 'Включить: Черновик поста', callback_data: 'notif:post_draft' },
    ]);
  });

  it('ученик видит только свой вид, не учительские (ADR-0062 — дефолт сузился до экзамена)', () => {
    const menu = buildNotificationsMenu([], ['exam_result']);

    expect(menu.text).not.toContain('Черновик поста');
    expect(menu.buttons).toEqual([
      [{ text: 'Выключить: Результат экзамена', callback_data: 'notif:exam_result' }],
    ]);
  });

  it('несколько ролей — объединение доступных видов', () => {
    const menu = buildNotificationsMenu(['teacher', 'accountant'], ['post_draft']);

    const callbackData = menu.buttons.map((row) => row[0]?.text);
    expect(callbackData).toEqual([
      'Выключить: Черновик поста',
      'Включить: Напоминание про запись',
      'Включить: Пост не ушёл',
      'Включить: Работа на проверку',
      'Включить: Оплаты и долги',
    ]);
  });

  it('без ролей (гость) — дефолт ученика', () => {
    const menu = buildNotificationsMenu([], ['exam_result']);

    expect(menu.buttons).toHaveLength(1);
  });

  it('строка про кабинет — на месте и у штата, и у ученика (ADR-0065)', () => {
    const staffMenu = buildNotificationsMenu(['teacher'], ['post_draft']);
    const studentMenu = buildNotificationsMenu([], ['exam_result']);

    expect(staffMenu.text).toContain('То же самое есть в кабинете, в «Профиле».');
    expect(studentMenu.text).toContain('То же самое есть в кабинете, в «Профиле».');
  });

  it('ученик с одним видом — меню не разваливается на пустых строках вокруг подсказки', () => {
    const menu = buildNotificationsMenu([], ['exam_result']);

    // Один вид + подсказка про кабинет — ровно два блока текста после
    // заголовка, разделённые пустой строкой, без утроенных переносов.
    expect(menu.text).toBe(
      'Уведомления, которые вам доступны:\n\n' +
        'Результат экзамена — включено\n' +
        'Придёт, когда учитель проверит вашу работу и выставит результат.\n\n' +
        'То же самое есть в кабинете, в «Профиле».',
    );
  });
});
