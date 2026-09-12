// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»): текст и кнопки экрана
// «Уведомления» по ролям и текущему состоянию.
import { buildNotificationsMenu } from './notifications-menu';

describe('buildNotificationsMenu', () => {
  it('учитель, всё включено — три вида, кнопки «Выключить»', () => {
    const menu = buildNotificationsMenu(
      ['teacher'],
      ['post_draft', 'recording_request', 'delivery_failed'],
    );

    expect(menu.text).toContain('Черновик поста — включено');
    expect(menu.text).toContain('Напоминание про запись — включено');
    expect(menu.text).toContain('Пост не ушёл — включено');
    expect(menu.buttons).toEqual([
      [{ text: 'Выключить: Черновик поста', callback_data: 'notif:post_draft' }],
      [
        {
          text: 'Выключить: Напоминание про запись',
          callback_data: 'notif:recording_request',
        },
      ],
      [{ text: 'Выключить: Пост не ушёл', callback_data: 'notif:delivery_failed' }],
    ]);
  });

  it('один вид выключен — его кнопка «Включить», текст «выключено»', () => {
    const menu = buildNotificationsMenu(
      ['teacher'],
      ['recording_request', 'delivery_failed'],
    );

    expect(menu.text).toContain('Черновик поста — выключено');
    expect(menu.buttons[0]).toEqual([
      { text: 'Включить: Черновик поста', callback_data: 'notif:post_draft' },
    ]);
  });

  it('ученик видит только свои виды, не учительские', () => {
    const menu = buildNotificationsMenu(['student'], ['lesson_soon', 'teacher_message']);

    expect(menu.text).not.toContain('Черновик поста');
    expect(menu.buttons).toEqual([
      [{ text: 'Выключить: Занятие скоро', callback_data: 'notif:lesson_soon' }],
      [
        {
          text: 'Выключить: Сообщение от учителя',
          callback_data: 'notif:teacher_message',
        },
      ],
    ]);
  });

  it('несколько ролей — объединение доступных видов', () => {
    const menu = buildNotificationsMenu(['teacher', 'accountant'], ['post_draft']);

    const callbackData = menu.buttons.map((row) => row[0]?.text);
    expect(callbackData).toEqual([
      'Выключить: Черновик поста',
      'Включить: Напоминание про запись',
      'Включить: Пост не ушёл',
      'Включить: Оплаты и долги',
    ]);
  });

  it('без ролей (гость) — дефолт ученика', () => {
    const menu = buildNotificationsMenu([], ['lesson_soon', 'teacher_message']);

    expect(menu.buttons).toHaveLength(2);
  });
});
