import { describe, expect, it } from 'vitest';
import { MEDIA_ERR_SRC_NOT_SUPPORTED, isUnsupportedFormat } from './videoRecoveryRules';

const NETWORK = 2;
const UNSUPPORTED = MEDIA_ERR_SRC_NOT_SUPPORTED;

describe('isUnsupportedFormat', () => {
  it('«не поддерживается» дважды подряд, метаданных не было, связь есть — формат', () => {
    expect(
      isUnsupportedFormat({
        code: UNSUPPORTED,
        previousCode: UNSUPPORTED,
        hasMetadata: false,
        isOnline: true,
      }),
    ).toBe(true);
  });

  it('первый раз — ещё нет: сначала одна перезагрузка, вдруг протухла ссылка', () => {
    expect(
      isUnsupportedFormat({
        code: UNSUPPORTED,
        previousCode: null,
        hasMetadata: false,
        isOnline: true,
      }),
    ).toBe(false);
  });

  it.each([
    ['прошлая ошибка была про сеть', UNSUPPORTED, NETWORK, false, true],
    ['текущая ошибка про сеть', NETWORK, UNSUPPORTED, false, true],
    ['ошибки без кода', null, null, false, true],
    ['метаданные уже приходили', UNSUPPORTED, UNSUPPORTED, true, true],
    ['связи нет', UNSUPPORTED, UNSUPPORTED, false, false],
  ])('%s — обрыв, не формат', (_name, code, previousCode, hasMetadata, isOnline) => {
    expect(isUnsupportedFormat({ code, previousCode, hasMetadata, isOnline })).toBe(
      false,
    );
  });

  it('isOnline по умолчанию — navigator.onLine (в jsdom связь есть)', () => {
    expect(
      isUnsupportedFormat({
        code: UNSUPPORTED,
        previousCode: UNSUPPORTED,
        hasMetadata: false,
      }),
    ).toBe(true);
  });
});
