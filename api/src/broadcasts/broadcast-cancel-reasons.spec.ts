// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import {
  CANCEL_REASON,
  TOO_LATE_REASON,
  classifyCancelReason,
} from './broadcast-cancel-reasons';

describe('classifyCancelReason', () => {
  it('у класса нет каналов рассылки — no_channels', () => {
    expect(classifyCancelReason(CANCEL_REASON.noChannels)).toBe('no_channels');
  });

  it('все каналы класса выключены — channels_disabled', () => {
    expect(classifyCancelReason(CANCEL_REASON.allChannelsDisabled)).toBe(
      'channels_disabled',
    );
  });

  it('ни один канал не подписан на теги занятия — no_channels_for_tags', () => {
    expect(classifyCancelReason(CANCEL_REASON.noChannelsForTags)).toBe(
      'no_channels_for_tags',
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
