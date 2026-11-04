// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import { CANCEL_REASON, TOO_LATE_REASON } from '../broadcasts/broadcast-cancel-reasons';
import { cancelledBroadcastMessage } from './broadcast-cancel-message';

const NAME = 'цигун для глаз 19:00';

describe('cancelledBroadcastMessage', () => {
  it('нет группы — что случилось, куда идти', () => {
    const text = cancelledBroadcastMessage(CANCEL_REASON.noGroup, NAME);

    expect(text).toContain(`«${NAME}»`);
    expect(text).toContain('у занятия нет группы');
    expect(text).toContain('страниц');
  });

  it('у группы нет канала — действие «Каналы»', () => {
    const text = cancelledBroadcastMessage(CANCEL_REASON.groupWithoutChannel, NAME);

    expect(text).toContain('у группы занятия нет канала');
    expect(text).toContain('«Каналах»');
  });

  it('нет ссылки — действие «Расписание»', () => {
    const text = cancelledBroadcastMessage(CANCEL_REASON.noLink, NAME);

    expect(text).toContain('нет ссылки');
    expect(text).toContain('«Расписании»');
  });

  it('тик опоздал — прошедшее время, действие «Журнал отправок»', () => {
    const text = cancelledBroadcastMessage(TOO_LATE_REASON, NAME);

    expect(text).toContain('не ушла');
    expect(text).toContain('занятие уже началось');
    expect(text).toContain('«Журнал отправок»');
  });

  it('класс выключен — осознанное решение учителя, текста нет', () => {
    expect(cancelledBroadcastMessage(CANCEL_REASON.classDisabled, NAME)).toBeUndefined();
  });

  it('причина без сформулированного действия — текста нет, не бросает', () => {
    expect(cancelledBroadcastMessage(CANCEL_REASON.noClass, NAME)).toBeUndefined();
    expect(cancelledBroadcastMessage('', NAME)).toBeUndefined();
  });
});
