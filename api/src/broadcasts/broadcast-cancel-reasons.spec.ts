// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import {
  CANCEL_REASON,
  TOO_LATE_REASON,
  classifyCancelReason,
} from './broadcast-cancel-reasons';

describe('classifyCancelReason', () => {
  it('у занятия нет группы — no_group', () => {
    expect(classifyCancelReason(CANCEL_REASON.noGroup)).toBe('no_group');
  });

  it('у группы занятия нет канала — group_without_channel', () => {
    expect(classifyCancelReason(CANCEL_REASON.groupWithoutChannel)).toBe(
      'group_without_channel',
    );
  });

  it('нет ссылки на занятие — no_link', () => {
    expect(classifyCancelReason(CANCEL_REASON.noLink)).toBe('no_link');
  });

  it('тик опоздал — too_late', () => {
    expect(classifyCancelReason(TOO_LATE_REASON)).toBe('too_late');
  });

  it('класс выключен — решение учителя, действие не нужно', () => {
    expect(classifyCancelReason(CANCEL_REASON.classDisabled)).toBeUndefined();
  });

  it('занятие без класса в базе / офлайн-занятие — без сформулированного действия', () => {
    expect(classifyCancelReason(CANCEL_REASON.noClass)).toBeUndefined();
    expect(classifyCancelReason(CANCEL_REASON.offline)).toBeUndefined();
  });

  it('произвольный текст (сбой recording-broadcast.service.ts) — undefined, не бросает', () => {
    expect(
      classifyCancelReason('рассылка записи не создалась: mongo упал'),
    ).toBeUndefined();
  });

  it('пустая строка — undefined', () => {
    expect(classifyCancelReason('')).toBeUndefined();
  });
});
