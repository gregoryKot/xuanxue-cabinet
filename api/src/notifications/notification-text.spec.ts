import { NOTIFICATION_LABELS } from '@xuanxue/shared';
import { notificationText } from './notification-text';

describe('notificationText', () => {
  it('ставит название формы после события', () => {
    expect(notificationText({ kind: 'exam_result', examTitle: 'Форма 24' })).toBe(
      'Работу проверили — Форма 24',
    );
    expect(notificationText({ kind: 'attempt_submitted', examTitle: 'Форма 24' })).toBe(
      'Работу прислали на проверку — Форма 24',
    );
  });

  // Форму могли удалить после того, как запись легла в ленту: строка обязана
  // остаться читаемой, а не оборваться разделителем.
  it('без названия отдаёт одно событие, без разделителя', () => {
    expect(notificationText({ kind: 'exam_result' })).toBe('Работу проверили');
    expect(notificationText({ kind: 'exam_result', examTitle: '   ' })).toBe(
      'Работу проверили',
    );
  });

  // Виды, которые в ленту пока не пишутся (post_draft и прочие штатные),
  // своей формулировки не имеют — лучше сухое название вида, чем пустая
  // строка.
  it('незнакомый вид падает на общее название из NOTIFICATION_LABELS', () => {
    expect(notificationText({ kind: 'post_draft' })).toBe(NOTIFICATION_LABELS.post_draft);
    expect(notificationText({ kind: 'post_draft', examTitle: 'Форма 24' })).toBe(
      `${NOTIFICATION_LABELS.post_draft} — Форма 24`,
    );
  });
});
