// Юнит на class-validator/class-transformer — без Nest и без Mongo
// (CLAUDE.md «Тесты»). Образец приёма — ListAppErrorsQueryDto.spec.ts.
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GoogleLoginDto } from './google-login.dto';

const VALID_CODE = 'x'.repeat(20);
const VALID_STATE = 'y'.repeat(43);

describe('GoogleLoginDto', () => {
  it('валидные code и state — валиден', async () => {
    const errors = await validate(
      plainToInstance(GoogleLoginDto, { code: VALID_CODE, state: VALID_STATE }),
    );
    expect(errors).toHaveLength(0);
  });

  it('code короче 10 символов — падает', async () => {
    const errors = await validate(
      plainToInstance(GoogleLoginDto, { code: 'short', state: VALID_STATE }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('state не 43 символа — падает', async () => {
    const errors = await validate(
      plainToInstance(GoogleLoginDto, { code: VALID_CODE, state: 'y'.repeat(10) }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('state с недопустимым символом — падает', async () => {
    const errors = await validate(
      plainToInstance(GoogleLoginDto, {
        code: VALID_CODE,
        state: `${'y'.repeat(42)}!`,
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('code отсутствует — падает', async () => {
    const errors = await validate(
      plainToInstance(GoogleLoginDto, { state: VALID_STATE }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('state отсутствует — падает', async () => {
    const errors = await validate(plainToInstance(GoogleLoginDto, { code: VALID_CODE }));
    expect(errors).not.toHaveLength(0);
  });
});
