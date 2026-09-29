// Тест глобальных слушателей необработанных сбоев (ADR-0071). reportClientError
// мокается целиком — его собственные защиты (дубли, потолок) проверены в
// reportClientError.test.ts, а мок здесь как раз ловит баг «повторный
// addEventListener», который дедуп в реальном reportClientError мог бы
// незаметно скрыть.
//
// Без vi.resetModules(): установка вешает настоящий слушатель на
// единственный window сеанса jsdom, и модуль, перезагруженный «набело» на
// каждый тест, оставил бы после себя рой старых слушателей (React такого не
// подчищает — этим и занимается сам installed-флаг). Вместо этого install
// зовём в каждом тесте: он идемпотентен по контракту, поэтому это и есть
// самая честная проверка — а call-историю мока чистим между тестами сами.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installGlobalErrorReporting } from './globalErrorReporting';
import { reportClientError } from './reportClientError';

vi.mock('./reportClientError', () => ({ reportClientError: vi.fn() }));
const reportClientErrorMock = vi.mocked(reportClientError);

// Ошибка «нашего» кода детерминированно: у настоящего `new Error().stack` в
// vitest кадры из file:///…/node_modules/@vitest/…, а origin jsdom —
// http://localhost:3000, и без явного стека фильтр чужого кода (errorSource.ts)
// принял бы каждую тестовую ошибку за чужую.
function ownError(message: string): Error {
  const error = new Error(message);
  error.stack = `Error: ${message}\n    at run (${window.location.origin}/assets/index-abc.js:1:2)`;
  return error;
}

beforeEach(() => {
  reportClientErrorMock.mockClear();
});

describe('installGlobalErrorReporting', () => {
  it('ловит необработанную ошибку и шлёт отчёт kind: unhandled', () => {
    installGlobalErrorReporting();
    const error = ownError('кабум');

    window.dispatchEvent(new ErrorEvent('error', { error, message: error.message }));

    expect(reportClientErrorMock).toHaveBeenCalledWith('unhandled', error);
  });

  // Часть браузеров/ситуаций отдаёт error пустым, но с осмысленным message —
  // тогда в отчёт идёт он (event.error ?? event.message в handleError). Ни
  // filename, ни стека нет — источник не определить, а неопознанное уходит
  // отчётом (errorSource.ts): лишний отчёт дешевле потерянного.
  it('без объекта error, но с осмысленным message — шлёт текст сообщения', () => {
    installGlobalErrorReporting();

    window.dispatchEvent(new ErrorEvent('error', { message: 'настоящая ошибка' }));

    expect(reportClientErrorMock).toHaveBeenCalledWith('unhandled', 'настоящая ошибка');
  });

  it('ловит отклонённый промис без .catch и шлёт отчёт kind: unhandled', () => {
    installGlobalErrorReporting();
    const reason = ownError('не поймали');
    // PromiseRejectionEvent не сконструировать напрямую (нет promise) —
    // обработчику нужен только reason, дописываем его на обычный Event.
    const event = new Event('unhandledrejection');
    Object.defineProperty(event, 'reason', { value: reason });

    window.dispatchEvent(event);

    expect(reportClientErrorMock).toHaveBeenCalledWith('unhandled', reason);
  });

  it('повторная установка не вешает второй слушатель', () => {
    installGlobalErrorReporting();
    installGlobalErrorReporting();
    const error = ownError('кабум');

    window.dispatchEvent(new ErrorEvent('error', { error, message: error.message }));

    expect(reportClientErrorMock).toHaveBeenCalledTimes(1);
  });

  // Неудачная загрузка <img>/<link> тоже называется 'error', но у такого
  // события target — сам элемент, а не window, и error пуст — это не сбой
  // кабинета, репортить нечего.
  it('ошибка загрузки картинки (event.target — элемент, не window) не уходит', () => {
    installGlobalErrorReporting();
    const img = document.createElement('img');
    document.body.appendChild(img);

    img.dispatchEvent(new Event('error', { bubbles: true }));

    expect(reportClientErrorMock).not.toHaveBeenCalled();
  });

  // 'Script error.' без файла/строки/стека — скрипт с чужого origin (CDN
  // без crossorigin, расширение браузера): подробностей нет и не будет.
  it('"Script error." без деталей (чужой origin) не уходит', () => {
    installGlobalErrorReporting();

    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));

    expect(reportClientErrorMock).not.toHaveBeenCalled();
  });

  // Инцидент 2026-09-29: `Can't find variable: EmptyRanges` из Safari на
  // /exams/:id. Бросило расширение; Safari отдал текст целиком, а адрес его
  // скрипта спрятал под webkit-masked-url://hidden/ — фильтр "Script error."
  // такое не видел, и владельца разбудили сбоем, который в кабинете не починить.
  it('ошибка расширения Safari (filename webkit-masked-url://hidden/) не уходит', () => {
    installGlobalErrorReporting();
    const message = "Can't find variable: EmptyRanges";

    window.dispatchEvent(
      new ErrorEvent('error', {
        error: new ReferenceError(message),
        message,
        filename: 'webkit-masked-url://hidden/',
      }),
    );

    expect(reportClientErrorMock).not.toHaveBeenCalled();
  });

  // Тот же инцидент, путь через промис: у unhandledrejection нет filename,
  // место броска видно только по кадру стека.
  it('отклонённый промис из расширения Safari (стек webkit-masked-url://hidden/) не уходит', () => {
    installGlobalErrorReporting();
    const reason = { message: 'x', stack: 'f@webkit-masked-url://hidden/:1:2' };
    const event = new Event('unhandledrejection');
    Object.defineProperty(event, 'reason', { value: reason });

    window.dispatchEvent(event);

    expect(reportClientErrorMock).not.toHaveBeenCalled();
  });

  it('ошибка из файла нашего origin (filename) уходит', () => {
    installGlobalErrorReporting();
    const error = ownError('кабум');

    window.dispatchEvent(
      new ErrorEvent('error', {
        error,
        message: error.message,
        filename: `${window.location.origin}/assets/index-abc.js`,
      }),
    );

    expect(reportClientErrorMock).toHaveBeenCalledWith('unhandled', error);
  });
});
