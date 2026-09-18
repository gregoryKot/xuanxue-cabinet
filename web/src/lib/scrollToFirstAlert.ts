// Прокрутка к первой ошибке формы после неудачного сохранения — на телефоне
// «Сохранить» стоит внизу страницы-редактора, а ошибка валидации рисуется у
// первого содержательного поля наверху (ExamItemFormFields, ExamAboutFields):
// без прокрутки нажатие выглядит как «ничего не произошло» (ADR-0046,
// потерянный вопрос с картинками). `behavior` учитывает prefers-reduced-motion
// (CLAUDE.md «Доступность»).
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    // matchMedia недоступен в части окружений (CLAUDE.md «Доступность») —
    // считаем, что анимация не мешает.
    return false;
  }
}

/** Первый `[role="alert"]` внутри контейнера — прокручивает к нему по центру
 * экрана. `container` — `null`, пока `<form>` ещё не смонтирована; в jsdom
 * нет `scrollIntoView` вовсе — вызов под проверкой, чтобы тест не падал. */
export function scrollToFirstAlert(container: HTMLElement | null): void {
  const alert = container?.querySelector<HTMLElement>('[role="alert"]');
  if (!alert || typeof alert.scrollIntoView !== 'function') return;

  alert.scrollIntoView({
    block: 'center',
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  });
}

/**
 * То же самое, но с отсрочкой на один микротакт — зовите сразу после
 * неудачного submit()/changeStatus() в обработчике формы.
 *
 * React обновляет DOM с текстом ошибки в том же обработчике `submit`
 * (браузер считает его дискретным событием и флашит синхронно), и продолжение
 * async-функции после `await form.submit()` обычно видит этот DOM уже
 * обновлённым. Полагаться на порядок внутренних микрозадач React рискованно —
 * поведение не задокументировано и может измениться, поэтому ждём микротакт
 * явно: к этому моменту ошибка гарантированно уже отрисована.
 */
export function scrollToFirstAlertSoon(container: HTMLElement | null): void {
  void Promise.resolve().then(() => scrollToFirstAlert(container));
}
