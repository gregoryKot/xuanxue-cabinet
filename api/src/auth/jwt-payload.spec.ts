// Юнит-тест разбора payload JWT (jwt-payload.ts) — подпись не проверяется,
// третья часть в токенах теста произвольная.
import { decodeJwtPayload } from './jwt-payload';

function token(payload: unknown): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

describe('decodeJwtPayload', () => {
  it('возвращает claims объекта', () => {
    expect(decodeJwtPayload(token({ sub: 'x', exp: 5 }))).toEqual({ sub: 'x', exp: 5 });
  });

  it('меньше трёх частей — не JWT', () => {
    expect(() => decodeJwtPayload('не.jwt')).toThrow('не похож на JWT');
  });

  it('пустая средняя часть — пустой payload', () => {
    expect(() => decodeJwtPayload('a..c')).toThrow('пустой payload');
  });

  it('payload не JSON', () => {
    const notJson = Buffer.from('не json').toString('base64url');
    expect(() => decodeJwtPayload(`a.${notJson}.c`)).toThrow('payload не JSON');
  });

  it.each([['null'], ['[1,2]'], ['"строка"'], ['42']])(
    'payload %s — не объект claims',
    (json) => {
      const body = Buffer.from(json).toString('base64url');
      expect(() => decodeJwtPayload(`a.${body}.c`)).toThrow('payload не объект');
    },
  );
});
