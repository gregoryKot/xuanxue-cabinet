// Список внешних источников CSP — единственное место (комментарий в csp.ts).
// Тест ловит будущий регресс: добавление домена без осознанного решения
// (ревью, SECURITY §7) не должно проходить незамеченным, как случилось с
// accounts.google.com при аудите этапа 1 (Google-вход ещё не реализован).
import { CSP_DIRECTIVES } from './csp';

describe('CSP_DIRECTIVES', () => {
  // Виджет Telegram и его попап убраны (ADR-0028): вход — переход вкладки
  // на oauth.telegram.org, CSP такую навигацию не ограничивает, и сам по
  // себе вход фрейма не требует. Единственный фрейм кабинета — плеер записи
  // (ADR-0099), поэтому список закрыт двумя хостингами: расширять его молча
  // нельзя, как было с accounts.google.com.
  it('frameSrc — только плеер записи, ровно два хостинга', () => {
    expect(CSP_DIRECTIVES.frameSrc).toEqual([
      'https://www.youtube-nocookie.com',
      'https://rutube.ru',
    ]);
  });

  it('scriptSrc и connectSrc не пускают произвольные домены — только self', () => {
    expect(CSP_DIRECTIVES.scriptSrc).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES.connectSrc).toEqual(["'self'"]);
  });

  it('objectSrc и frameAncestors закрыты полностью', () => {
    expect(CSP_DIRECTIVES.objectSrc).toEqual(["'none'"]);
    expect(CSP_DIRECTIVES.frameAncestors).toEqual(["'none'"]);
  });
});
