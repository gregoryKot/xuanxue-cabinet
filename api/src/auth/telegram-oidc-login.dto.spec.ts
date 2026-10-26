// Юнит на class-validator/class-transformer — без Nest и без Mongo
// (CLAUDE.md «Тесты»). Образец — google-login.dto.spec.ts.
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TELEGRAM_LOGIN_FAILED_MESSAGE } from '@xuanxue/shared';
import { TelegramOidcLoginDto } from './telegram-oidc-login.dto';

const VALID_CODE = 'x'.repeat(20);
const VALID_STATE = 'y'.repeat(43);

function check(body: Record<string, unknown>) {
  return validate(plainToInstance(TelegramOidcLoginDto, body));
}

describe('TelegramOidcLoginDto', () => {
  it('валидные code и state — валиден', async () => {
    expect(await check({ code: VALID_CODE, state: VALID_STATE })).toHaveLength(0);
  });

  it.each([
    ['code короче 10 символов', { code: 'short', state: VALID_STATE }],
    [
      'code с пробелом',
      { code: `${'x'.repeat(10)} ${'x'.repeat(10)}`, state: VALID_STATE },
    ],
    ['state не 43 символа', { code: VALID_CODE, state: 'y'.repeat(10) }],
    ['state с недопустимым символом', { code: VALID_CODE, state: `${'y'.repeat(42)}!` }],
    ['code отсутствует', { state: VALID_STATE }],
    ['state отсутствует', { code: VALID_CODE }],
    ['code числом', { code: 1234567890, state: VALID_STATE }],
  ])('%s — падает', async (_label, body) => {
    expect(await check(body)).not.toHaveLength(0);
  });

  it('текст ошибки — общий «не получилось войти», без подробностей формата', async () => {
    const [error] = await check({ code: 'short', state: VALID_STATE });

    expect(Object.values(error?.constraints ?? {})).toEqual([
      TELEGRAM_LOGIN_FAILED_MESSAGE,
    ]);
  });
});
