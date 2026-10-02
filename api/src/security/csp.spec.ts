// Список внешних источников CSP — единственное место (комментарий в csp.ts).
// Тест ловит будущий регресс: добавление домена без осознанного решения
// (ревью, SECURITY §7) не должно проходить незамеченным, как случилось с
// accounts.google.com при аудите этапа 1 (Google-вход ещё не реализован).
import { CSP_DIRECTIVES } from './csp';

describe('CSP_DIRECTIVES', () => {
  // Виджет Telegram и его попап убраны (ADR-0028): вход — переход вкладки
  // на oauth.telegram.org, CSP такую навигацию не ограничивает, и сам по
  // себе вход фрейма не требует. Единственный фрейм кабинета — плеер записи
  // (ADR-0100), поэтому список закрыт двумя хостингами: расширять его молча
  // нельзя, как было с accounts.google.com.
  it('frameSrc — только плеер записи, ровно два хостинга', () => {
    expect(CSP_DIRECTIVES.frameSrc).toEqual([
      'https://www.youtube-nocookie.com',
      'https://rutube.ru',
    ]);
  });

  // Без 'unsafe-inline' и 'unsafe-eval' на этом держится и фильтр отчётов о
  // сбоях: место броска с адресом самой страницы считается чужим кодом
  // (web/src/errors/errorSource.ts, ADR-0071, инцидент 2026-10-02). Ослабить
  // scriptSrc — значит сначала пересмотреть то правило.
  it('scriptSrc не пускает произвольные домены — только self', () => {
    expect(CSP_DIRECTIVES.scriptSrc).toEqual(["'self'"]);
  });

  // PostHog (ADR-0143) — без прокси, браузер шлёт события прямо на
  // eu.i.posthog.com; единственное исключение из 'self' в connectSrc.
  it('connectSrc — self и PostHog EU, ровно один сторонний домен', () => {
    expect(CSP_DIRECTIVES.connectSrc).toEqual(["'self'", 'https://eu.i.posthog.com']);
  });

  it('objectSrc и frameAncestors закрыты полностью', () => {
    expect(CSP_DIRECTIVES.objectSrc).toEqual(["'none'"]);
    expect(CSP_DIRECTIVES.frameAncestors).toEqual(["'none'"]);
  });

  // <video> вопроса/варианта грузит `/api/exam-videos/:id`, который
  // редиректит на подписанную ссылку R2 (ADR-0133) — без mediaSrc браузер
  // отказал бы уже на редиректе.
  it('mediaSrc — self и R2, ровно один сторонний домен', () => {
    expect(CSP_DIRECTIVES.mediaSrc).toEqual([
      "'self'",
      'https://*.r2.cloudflarestorage.com',
    ]);
  });
});
