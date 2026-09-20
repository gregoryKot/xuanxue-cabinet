// Тексты DM админу про сбой (CLAUDE.md «Ошибки»: сбой уходит админу, но текст
// самого исключения — нет, только код обращения для поиска в логах Railway).
// Два отправителя, один хвост: неизвестная ошибка сервера (ADR-0053) и сбой в
// браузере (ADR-0071). Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»,
// образец — attempt-submitted-message.ts/exam-graded-message.ts).
import type { ClientErrorKind } from '@xuanxue/shared';
import type {
  AppErrorAlertContext,
  ClientErrorAlertContext,
} from '../common/app-error-alerts';

/** Что упало в браузере — одной фразой для владельца, без слов «исключение» и
 * «промис» (docs/VOICE.md). `chunk` до Telegram не доезжает (он чинится сам
 * перезагрузкой, ADR-0071), но вид перечислим целиком: молчаливая дыра в
 * Record хуже лишней строки. */
const CLIENT_ERROR_KIND_LABELS: Record<ClientErrorKind, string> = {
  render: 'экран не нарисовался',
  unhandled: 'ошибка вне рендера',
  chunk: 'не догрузился код экрана',
};

/** Что делать дальше — общий хвост обоих сообщений (docs/VOICE.md: текст
 * ошибки говорит, что случилось и что сделать). */
function whereToLook(requestId?: string): string {
  if (!requestId) {
    return 'Кода обращения нет — найдите ошибку в логах Railway по времени и адресу.';
  }
  return `Код обращения — ${requestId}. Посмотрите логи Railway по этому коду.`;
}

export function appErrorAlertMessage(context: AppErrorAlertContext): string {
  return `Сбой в кабинете: ${context.method} ${context.path}. ${whereToLook(context.requestId)}`;
}

export function clientErrorAlertMessage(context: ClientErrorAlertContext): string {
  const what = CLIENT_ERROR_KIND_LABELS[context.kind];
  return `Сбой в браузере, ${context.path} — ${what}. ${whereToLook(context.requestId)}`;
}
