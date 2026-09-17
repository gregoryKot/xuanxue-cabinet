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

  it('ученик видит только свои виды, не учительские', () => {
    const menu = buildNotificationsMenu(
      [],
      ['lesson_soon', 'teacher_message', 'exam_result'],
    );

    expect(menu.text).not.toContain('Черновик поста');
    expect(menu.buttons).toEqual([
      [{ text: 'Выключить: Занятие скоро', callback_data: 'notif:lesson_soon' }],
      [
        {
          text: 'Выключить: Сообщение от учителя',
          callback_data: 'notif:teacher_message',
        },
      ],
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
    const menu = buildNotificationsMenu([], ['lesson_soon', 'teacher_message']);

    expect(menu.buttons).toHaveLength(3);
  });
});
