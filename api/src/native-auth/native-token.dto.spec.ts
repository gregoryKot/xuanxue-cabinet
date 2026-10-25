// Те же опции, что у глобального ValidationPipe и строгого разбора формы
// (native-http.ts): повтор имени приходит массивом, лишнее поле запрещено.
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NATIVE_CLIENT_ID, NATIVE_REDIRECT_URI } from '@xuanxue/shared';
import { NativeTokenDto } from './native-token.dto';

const FORM: Record<string, unknown> = {
  grant_type: 'authorization_code',
  client_id: NATIVE_CLIENT_ID,
  redirect_uri: NATIVE_REDIRECT_URI,
  code: 'k'.repeat(43),
  code_verifier: 'v'.repeat(43),
};

function errorsOf(body: Record<string, unknown>): Promise<string[]> {
  return validate(plainToInstance(NativeTokenDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).then((errors) => errors.map((error) => error.property));
}

describe('NativeTokenDto', () => {
  it('форма по профилю — проходит', async () => {
    expect(await errorsOf(FORM)).toEqual([]);
  });

  it('повтор поля (массив) — не проходит', async () => {
    expect(await errorsOf({ ...FORM, code: ['k'.repeat(43), 'k'.repeat(43)] })).toEqual([
      'code',
    ]);
  });

  it('неизвестное поле — не проходит', async () => {
    expect(await errorsOf({ ...FORM, scope: 'account:read' })).toEqual(['scope']);
  });

  it('пустое поле — не проходит', async () => {
    expect(await errorsOf({ ...FORM, code_verifier: '' })).toEqual(['code_verifier']);
  });
});
