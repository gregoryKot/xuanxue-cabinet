import { NOTIFICATION_LABELS } from '@xuanxue/shared';
import { notificationText } from './notification-text';

describe('notificationText', () => {
  it('ставит название формы после события', () => {
    expect(notificationText({ kind: 'exam_result', title: 'Форма 24' })).toBe(
      'Работу проверили — Форма 24',
    );
    expect(notificationText({ kind: 'attempt_submitted', title: 'Форма 24' })).toBe(
      'Работу прислали на проверку — Форма 24',
    );
  });

  // Форму могли удалить после того, как запись легла в ленту: строка обязана
  // остаться читаемой, а не оборваться разделителем.
  it('без названия отдаёт одно событие, без разделителя', () => {
    expect(notificationText({ kind: 'exam_result' })).toBe('Работу проверили');
    expect(notificationText({ kind: 'exam_result', title: '   ' })).toBe(
      'Работу проверили',
    );
  });

  it('lesson_soon — «Скоро занятие» с названием класса (ADR-0135)', () => {
    expect(notificationText({ kind: 'lesson_soon', title: 'Цигун для глаз' })).toBe(
      'Скоро занятие — Цигун для глаз',
    );
    expect(notificationText({ kind: 'lesson_soon' })).toBe('Скоро занятие');
  });

  it('payment_due — «Напоминание об оплате» с названием месяца (ADR-0150)', () => {
    expect(notificationText({ kind: 'payment_due', title: 'сентябрь 2026' })).toBe(
      'Напоминание об оплате — сентябрь 2026',
    );
    expect(notificationText({ kind: 'payment_due' })).toBe('Напоминание об оплате');
  });

  it('payments — «Снимок перевода ждёт подтверждения» с названием месяца (ADR-0156)', () => {
    expect(notificationText({ kind: 'payments', title: 'сентябрь 2026' })).toBe(
      'Снимок перевода ждёт подтверждения — сентябрь 2026',
    );
    expect(notificationText({ kind: 'payments' })).toBe(
      'Снимок перевода ждёт подтверждения',
    );
  });

  // Виды, которые в ленту пока не пишутся (post_draft и прочие штатные),
  // своей формулировки не имеют — лучше сухое название вида, чем пустая
  // строка.
  it('незнакомый вид падает на общее название из NOTIFICATION_LABELS', () => {
    expect(notificationText({ kind: 'post_draft' })).toBe(NOTIFICATION_LABELS.post_draft);
    expect(notificationText({ kind: 'post_draft', title: 'Форма 24' })).toBe(
      `${NOTIFICATION_LABELS.post_draft} — Форма 24`,
    );
  });
});
