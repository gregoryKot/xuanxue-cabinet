// Список внешних источников CSP — единственное место (комментарий в csp.ts).
// Тест ловит будущий регресс: добавление домена без осознанного решения
// (ревью, SECURITY §7) не должно проходить незамеченным, как случилось с
// accounts.google.com при аудите этапа 1 (Google-вход ещё не реализован).
import { CSP_DIRECTIVES } from './csp';

describe('CSP_DIRECTIVES', () => {
  it('frameSrc — только Telegram: Google-вход ещё не реализован (ADR-0005)', () => {
    expect(CSP_DIRECTIVES.frameSrc).toEqual(['https://oauth.telegram.org']);
  });

  it('scriptSrc не пускает произвольные домены — self и Telegram', () => {
    expect(CSP_DIRECTIVES.scriptSrc).toEqual([
      "'self'",
      'https://telegram.org',
      'https://oauth.telegram.org',
    ]);
  });

  it('objectSrc и frameAncestors закрыты полностью', () => {
    expect(CSP_DIRECTIVES.objectSrc).toEqual(["'none'"]);
    expect(CSP_DIRECTIVES.frameAncestors).toEqual(["'none'"]);
  });
});
