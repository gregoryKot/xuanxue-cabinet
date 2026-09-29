// Единственная точка отправки отчёта о сбое браузера на сервер (ADR-0071).
// Раньше ErrorBoundary писал только console.error — сбой был виден лишь
// тому, у кого сломался экран: ни строки в логах Railway, ни сообщения в
// Telegram владельцу. Контракт тела запроса — shared/src/client-errors.ts,
// приёмник — POST /api/client-errors (api/src/client-errors/).
//
// Функцию зовут три места: ErrorBoundary (kind: 'render'),
// globalErrorReporting.ts (kind: 'unhandled') и app/lazyRoute.ts
// (kind: 'chunk') — общий код вместо трёх копий одних и тех же четырёх
// защит ниже (CLAUDE.md «Одна механика — один компонент»).
import {
  CLIENT_ERROR_LIMITS,
  clampClientErrorText,
  type ClientErrorKind,
  type ReportClientErrorInput,
} from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { ApiError } from '../api/http';

/** Потолок отчётов за одну загрузку страницы — сломанный экран, который
 * дёргает отчёт на каждый ре-рендер, не должен превратиться в очередь из
 * сотен запросов. */
const MAX_REPORTS_PER_PAGE_LOAD = 3;

/** Отчёт не имеет права висеть: lazyRoute.ts ждёт его перед перезагрузкой
 * страницы, и запрос, зависший до таймаута браузера (минуты), оставил бы
 * человека на скелетоне. Три секунды — потолок ожидания, дальше отчёт
 * бросаем: он и так не гарантирован (потолок, дедуп), а экран важнее. */
const REPORT_TIMEOUT_MS = 3000;

/** Разделитель кусков подписи — символ, которого не бывает ни в виде сбоя, ни
 * в адресе, ни в тексте: склейка через пробел спутала бы «render /a b» и
 * «render /a» с текстом «b». Записан escape-последовательностью, не самим
 * байтом: настоящий NUL в исходнике делает файл бинарным для git, и дифф
 * такого файла в ревью не виден. */
const SIGNATURE_SEPARATOR = '\0';

// Модульные переменные, не React-состояние: отчёт шлют и классовый компонент
// (ErrorBoundary), и обработчики вне дерева React (globalErrorReporting,
// lazyRoute). Сбрасываются только перезагрузкой страницы — что и требуется
// («за загрузку страницы» в тексте задачи); функцию сброса для тестов не
// заводим — knip уронит CI на экспорт без рантайм-импортёра, тесты берут
// свежий модуль через vi.resetModules().
let reportsSentCount = 0;
let reportInFlight = false;
const sentSignatures = new Set<string>();

/** `error.message` у `Error`, иначе строковое представление значения —
 * контракт запрещает стек и что угодно, кроме текста (SECURITY, шапка
 * client-errors.ts). */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Отправляет отчёт о сбое на сервер. Никогда не бросает: сбой самой отправки
 * не должен уронить вызывающий код (рендер, глобальный слушатель, загрузку
 * чанка).
 */
export async function reportClientError(
  kind: ClientErrorKind,
  error: unknown,
): Promise<void> {
  // Ошибку самого API не пересказываем: 5xx сервер уже отправил владельцу
  // сам (ADR-0053), 4xx — ожидаемый отказ (например, форма не прошла
  // валидацию), а сетевой сбой (ApiError со status: 0, см. api/http.ts) —
  // это человек в метро без связи, будить им владельца в Telegram незачем.
  if (error instanceof ApiError) return;

  // Пока летит предыдущий отчёт — новый не начинаем: без этого сбой самой
  // отправки (например, offline) мог бы тут же породить второй отчёт о том
  // же самом событии.
  if (reportInFlight) return;

  if (reportsSentCount >= MAX_REPORTS_PER_PAGE_LOAD) return;

  const message = clampClientErrorText(messageOf(error), CLIENT_ERROR_LIMITS.message);
  const path = clampClientErrorText(window.location.pathname, CLIENT_ERROR_LIMITS.path);

  // Дубль — тот же вид, адрес и текст за одну загрузку страницы (например,
  // сбой на каждом ре-рендере одного и того же экрана) — уходит один раз.
  const signature = [kind, path, message].join(SIGNATURE_SEPARATOR);
  if (sentSignatures.has(signature)) return;

  // Помечаем подпись и место в потолке сразу, а не после ответа сервера:
  // повтор того же сбоя, пока летит запрос или после его провала, не должен
  // открыть вторую попытку — «не зацикливаться» важнее, чем «доставить
  // любой ценой» (нет и не планируется retry для этого отчёта, в отличие от
  // доставки рассылок).
  sentSignatures.add(signature);
  reportsSentCount += 1;
  reportInFlight = true;
  try {
    const input: ReportClientErrorInput = { kind, message, path };
    await apiRoute('POST /client-errors', {
      body: input,
      // Вкладку закрывают сразу после сбоя чаще, чем дочитывают ошибку, а
      // обычный fetch браузер обрывает вместе с документом — владелец о самом
      // частом сбое не узнавал. `keepalive` переживает выгрузку страницы и,
      // в отличие от navigator.sendBeacon (ADR-0071, «Альтернативы»), умеет
      // поставить x-requested-with — выводить маршрут из-под CSRF-проверки
      // (SECURITY §2) не приходится.
      //
      // Потолок спецификации — 64 КиБ на все живые keepalive-запросы разом.
      // Здесь такой запрос всегда один (reportInFlight выше), тело — три
      // коротких поля с потолками 300 и 200 знаков (CLIENT_ERROR_LIMITS):
      // даже с экранированием это пара килобайт, запас к потолку — десятки
      // раз. Проверено тестом про размер тела в reportClientError.test.ts.
      keepalive: true,
      // Таймаут с keepalive не спорит: он держится на таймере документа, а у
      // закрытой вкладки таймеры уже не срабатывают — отрезать улетевший
      // отчёт нечему. Пока страница жива, он нужен по-прежнему: lazyRoute.ts
      // ждёт этот промис перед перезагрузкой.
      signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
    });
  } catch {
    // Сама отправка не удалась (нет связи, сервер лёг) — глотаем молча:
    // отчёт о сбое не стоит того, чтобы стать вторым сбоем.
  } finally {
    reportInFlight = false;
  }
}
