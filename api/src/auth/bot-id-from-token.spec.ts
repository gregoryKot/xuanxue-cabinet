import { botIdFromToken } from './bot-id-from-token';

describe('botIdFromToken', () => {
  it('валидный BOT_TOKEN — числовой префикс', () => {
    expect(botIdFromToken('123456:abcDEF-token_value_padding_here')).toBe(123456);
  });

  it('undefined — undefined', () => {
    expect(botIdFromToken(undefined)).toBeUndefined();
  });

  it('пустая строка — undefined', () => {
    expect(botIdFromToken('')).toBeUndefined();
  });

  it('без двоеточия — undefined (префикс не число)', () => {
    expect(botIdFromToken('not-a-token')).toBeUndefined();
  });

  it('нулевой/отрицательный префикс — undefined', () => {
    expect(botIdFromToken('0:secret')).toBeUndefined();
    expect(botIdFromToken('-5:secret')).toBeUndefined();
  });
});
