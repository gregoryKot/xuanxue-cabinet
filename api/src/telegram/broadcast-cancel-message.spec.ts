// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import { CANCEL_REASON, TOO_LATE_REASON } from '../broadcasts/broadcast-cancel-reasons';
import { cancelledBroadcastMessage } from './broadcast-cancel-message';

const NAME = 'цигун для глаз 19:00';

describe('cancelledBroadcastMessage', () => {
  it('нет каналов — что случилось, куда идти', () => {
    const text = cancelledBroadcastMessage(CANCEL_REASON.noChannels, NAME);

    expect(text).toContain(`«${NAME}»`);
    expect(text).toContain('нет каналов рассылки');
    expect(text).toContain('«Расписании»');
  });

  it('все каналы выключены — действие «Каналы»', () => {
    const text = cancelledBroadcastMessage(CANCEL_REASON.allChannelsDisabled, NAME);

    expect(text).toContain('все каналы класса выключены');
    expect(text).toContain('«Каналах»');
  });

  it('нет ссылки — действие «Расписание»', () => {
    const text = cancelledBroadcastMessage(CANCEL_REASON.noLink, NAME);

    expect(text).toContain('нет ссылки');
    expect(text).toContain('«Расписании»');
  });

  it('тик опоздал — прошедшее время, действие «Рассылки»', () => {
    const text = cancelledBroadcastMessage(TOO_LATE_REASON, NAME);

    expect(text).toContain('не ушла');
    expect(text).toContain('занятие уже началось');
    expect(text).toContain('«Рассылках»');
  });

  it('класс выключен — осознанное решение учителя, текста нет', () => {
    expect(cancelledBroadcastMessage(CANCEL_REASON.classDisabled, NAME)).toBeUndefined();
  });

  it('причина без сформулированного действия — текста нет, не бросает', () => {
    expect(cancelledBroadcastMessage(CANCEL_REASON.noClass, NAME)).toBeUndefined();
    expect(cancelledBroadcastMessage('', NAME)).toBeUndefined();
  });
});
