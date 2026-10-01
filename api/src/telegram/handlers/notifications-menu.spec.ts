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
      [{ text: 'Выключить', callback_data: 'notif:post_draft' }],
      [{ text: 'Выключить', callback_data: 'notif:recording_request' }],
      [{ text: 'Выключить', callback_data: 'notif:delivery_failed' }],
      [{ text: 'Выключить', callback_data: 'notif:attempt_submitted' }],
    ]);
  });

  it('один вид выключен — его кнопка «Включить», текст «выключено»', () => {
    const menu = buildNotificationsMenu(
      ['teacher'],
      ['recording_request', 'delivery_failed', 'attempt_submitted'],
    );

    expect(menu.text).toContain('Черновик поста — выключено');
    expect(menu.buttons[0]).toEqual([
      { text: 'Включить', callback_data: 'notif:post_draft' },
    ]);
  });

  it('ученик видит только свои виды, не учительские (экзамен, занятие, его отмена и запись, оплата)', () => {
    const menu = buildNotificationsMenu(
      [],
      ['exam_result', 'lesson_soon', 'lesson_cancelled', 'payment_due'],
    );

    expect(menu.text).not.toContain('Черновик поста');
    expect(menu.buttons).toEqual([
      [{ text: 'Выключить', callback_data: 'notif:exam_result' }],
      [{ text: 'Выключить', callback_data: 'notif:lesson_soon' }],
      [{ text: 'Выключить', callback_data: 'notif:lesson_cancelled' }],
      [{ text: 'Включить', callback_data: 'notif:recording_ready' }],
      [{ text: 'Включить', callback_data: 'notif:material_new' }],
      [{ text: 'Выключить', callback_data: 'notif:payment_due' }],
    ]);
  });

  // ADR-0162: «Запись занятия» — вид «по желанию». Ученик видит его в меню
  // выключенным, хотя сам ничего не переключал; включённый — с кнопкой «Выключить».
  // Штат его не видит вовсе: у него таких видов нет.
  it('«Запись занятия»: ученику — выключена и с подсказкой, включил — «включено», штату — нет', () => {
    const off = buildNotificationsMenu([], ['exam_result']);
    const on = buildNotificationsMenu([], ['recording_ready']);
    const teacher = buildNotificationsMenu(['teacher'], ['post_draft']);

    expect(off.text).toContain(
      'Запись занятия — выключено\n' +
        'Придёт, когда учитель добавит запись занятия, — в кабинет и push-уведомлением. ' +
        'Обычно выключено: включите, если смотрите записи.',
    );
    expect(on.text).toContain('Запись занятия — включено');
    expect(on.buttons).toContainEqual([
      { text: 'Выключить', callback_data: 'notif:recording_ready' },
    ]);
    expect(teacher.text).not.toContain('Запись занятия');
    expect(teacher.buttons).toHaveLength(4);
  });

  // ADR-0162: «Новый материал» — второй вид «по желанию», тем же способом.
  it('«Новый материал»: ученику — выключен и с подсказкой, включил — «включено», штату — нет', () => {
    const off = buildNotificationsMenu([], ['exam_result']);
    const on = buildNotificationsMenu([], ['material_new']);
    const teacher = buildNotificationsMenu(['teacher'], ['post_draft']);

    expect(off.text).toContain(
      'Новый материал — выключено\n' +
        'Придёт, когда учитель добавит в библиотеку материал к вашим занятиям, — в кабинет ' +
        'и push-уведомлением. Обычно выключено: включите, если следите за библиотекой.',
    );
    expect(on.text).toContain('Новый материал — включено');
    expect(on.buttons).toContainEqual([
      { text: 'Выключить', callback_data: 'notif:material_new' },
    ]);
    expect(teacher.text).not.toContain('Новый материал');
  });

  // ADR-0162: «Занятие отменено» — ученический вид, в меню бота он стоит с
  // подписью и подсказкой из общего контракта; учителю его не показывают.
  it('«Занятие отменено» — с подсказкой у ученика и без следа у учителя', () => {
    const student = buildNotificationsMenu([], ['lesson_cancelled']);
    const teacher = buildNotificationsMenu(['teacher'], ['post_draft']);

    expect(student.text).toContain(
      'Занятие отменено — включено\n' +
        'Придёт сразу, как учитель отменит занятие, — в кабинет и push-уведомлением.',
    );
    expect(teacher.text).not.toContain('Занятие отменено');
  });

  it('несколько ролей — объединение доступных видов, ярлык вида — только в тексте, не на кнопке', () => {
    const menu = buildNotificationsMenu(['teacher', 'accountant'], ['post_draft']);

    const callbackData = menu.buttons.map((row) => row[0]?.text);
    expect(callbackData).toEqual([
      'Выключить',
      'Включить',
      'Включить',
      'Включить',
      'Включить',
    ]);
  });

  it('без ролей (гость) — дефолт ученика и вид «по желанию», пять кнопок', () => {
    const menu = buildNotificationsMenu(
      [],
      ['exam_result', 'lesson_soon', 'lesson_cancelled', 'payment_due'],
    );

    expect(menu.buttons).toHaveLength(6);
  });

  it('ученик с одним включённым видом — меню не разваливается на пустых строках вокруг подсказки', () => {
    const menu = buildNotificationsMenu([], ['exam_result']);

    // Один вид в тексте (у ученика их доступно шесть, но сюда передан один
    // включённый — buildNotificationsMenu всё равно рисует все, остальные
    // выключенными) — блоки разделены ровно одним пустым переносом, без
    // утроенных. Хвост один — про то, чего бот не переключает (ADR-0162);
    // «есть ещё кабинет» про сами переключатели не повторяется (ADR-0065:
    // бот и кабинет переключают одно и то же).
    expect(menu.text).toBe(
      'Уведомления, которые вам доступны:\n\n' +
        'Результат экзамена — включено\n' +
        'Придёт, когда учитель проверит вашу работу и выставит результат.\n\n' +
        'Занятие скоро — выключено\n' +
        'Придёт перед началом занятия — в кабинет и push-уведомлением на телефон.\n\n' +
        'Занятие отменено — выключено\n' +
        'Придёт сразу, как учитель отменит занятие, — в кабинет и push-уведомлением.\n\n' +
        'Запись занятия — выключено\n' +
        'Придёт, когда учитель добавит запись занятия, — в кабинет и push-уведомлением. ' +
        'Обычно выключено: включите, если смотрите записи.\n\n' +
        'Новый материал — выключено\n' +
        'Придёт, когда учитель добавит в библиотеку материал к вашим занятиям, — в кабинет ' +
        'и push-уведомлением. Обычно выключено: включите, если следите за библиотекой.\n\n' +
        'Напоминание об оплате — выключено\n' +
        'Придёт раз в месяц, в день оплаты.\n\n' +
        'О каких занятиях и за сколько напоминать — в кабинете: Уведомления → Настройки.',
    );
  });

  // ADR-0162, п. 5: выбор занятий и «за сколько» бот не переключает — строка
  // говорит, где это сделать. Нужна тому, у кого есть вид про занятие.
  describe('строка про настройки занятий в кабинете', () => {
    const NOTE =
      'О каких занятиях и за сколько напоминать — в кабинете: Уведомления → Настройки.';

    it('ученику — одна строка в конце, после всех видов', () => {
      const menu = buildNotificationsMenu([], ['exam_result', 'lesson_soon']);

      expect(menu.text.split(NOTE)).toHaveLength(2);
      expect(menu.text.endsWith(NOTE)).toBe(true);
      expect(menu.text.indexOf(NOTE)).toBeGreaterThan(
        menu.text.indexOf('Напоминание об оплате'),
      );
    });

    it('ученику она на месте, даже если «Занятие скоро» выключено: настройки нужны, чтобы включить осмысленно', () => {
      const menu = buildNotificationsMenu([], ['exam_result']);

      expect(menu.text).toContain(NOTE);
    });

    it.each(['teacher', 'assistant', 'admin', 'accountant'] as const)(
      'штату (%s) строки нет: у него вида про занятие нет, выбирать нечего',
      (role) => {
        const menu = buildNotificationsMenu([role], []);

        expect(menu.text).not.toContain('О каких занятиях');
        expect(menu.text).not.toContain('Уведомления → Настройки');
      },
    );

    it('кнопок она не добавляет: ни у ученика, ни у учителя', () => {
      expect(buildNotificationsMenu([], ['exam_result']).buttons).toHaveLength(6);
      expect(buildNotificationsMenu(['teacher'], []).buttons).toHaveLength(4);
    });

    it('без роли (гость) — тот же дефолт ученика, строка есть', () => {
      expect(buildNotificationsMenu([], []).text).toContain(NOTE);
    });
  });
});
