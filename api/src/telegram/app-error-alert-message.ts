// Тексты DM админу про сбой (CLAUDE.md «Ошибки»: сбой уходит админу, но текст
// самого исключения — нет). Два отправителя, один хвост: неизвестная ошибка
// сервера (ADR-0053) и сбой в браузере (ADR-0071). Чистая логика, без Mongo и
// DI (CLAUDE.md «Тесты», образец — attempt-submitted-message.ts/exam-graded-message.ts).
//
// Хвост (ADR-0132): текст ошибки теперь лежит и в журнале сбоев (экран
// «Сбои», роль `admin`), не только в логах Railway — с `PUBLIC_URL` хвост
// становится ссылкой на карточку записи по коду обращения, без него остаётся
// прежним «смотрите логи» (ADR-0009: ссылки только от `PUBLIC_URL`, не от
// заголовка Host).
import { APP_ERROR_KIND_LABELS, APP_ERRORS_SCREEN_PATH } from '@xuanxue/shared';
import type {
  AppErrorAlertContext,
  ClientErrorAlertContext,
} from '../common/app-error-alerts';

/** Ссылка на запись журнала по коду обращения — только когда есть и код, и
 * `PUBLIC_URL`: без кода фильтровать экран «Сбои» не по чему, без адреса
 * школы ссылка ушла бы неполной строкой (ADR-0009). */
function errorLink(requestId: string, publicUrl: string | undefined): string | undefined {
  if (!publicUrl) return undefined;
  return `${publicUrl}${APP_ERRORS_SCREEN_PATH}?requestId=${encodeURIComponent(requestId)}`;
}

/** Что делать дальше — общий хвост обоих сообщений (docs/VOICE.md: текст
 * ошибки говорит, что случилось и что сделать). */
function whereToLook(
  requestId: string | undefined,
  publicUrl: string | undefined,
): string {
  if (!requestId) {
    return 'Кода обращения нет — найдите ошибку в логах Railway по времени и адресу.';
  }
  const link = errorLink(requestId, publicUrl);
  if (!link) {
    return `Код обращения — ${requestId}. Посмотрите логи Railway по этому коду.`;
  }
  return `Код обращения — ${requestId}. Текст ошибки: ${link}`;
}

export function appErrorAlertMessage(
  context: AppErrorAlertContext,
  publicUrl?: string,
): string {
  return `Сбой в кабинете: ${context.method} ${context.path}. ${whereToLook(context.requestId, publicUrl)}`;
}

export function clientErrorAlertMessage(
  context: ClientErrorAlertContext,
  publicUrl?: string,
): string {
  const what = APP_ERROR_KIND_LABELS[context.kind];
  return `Сбой в браузере, ${context.path} — ${what}. ${whereToLook(context.requestId, publicUrl)}`;
}
