// Текст DM админу «в кабинете сбой» (CLAUDE.md «Ошибки»: неизвестная ошибка
// сервера уходит админу, но текст самого исключения — нет, только requestId
// для поиска в логах Railway). Чистая логика, без Mongo и DI (CLAUDE.md
// «Тесты», образец — attempt-submitted-message.ts/exam-graded-message.ts).
import type { AppErrorAlertContext } from '../common/app-error-alerts';

export function appErrorAlertMessage(context: AppErrorAlertContext): string {
  const request = `${context.method} ${context.path}`;
  if (!context.requestId) {
    return (
      `Сбой в кабинете: ${request}. Кода обращения нет — найдите ошибку в логах ` +
      'Railway по времени и адресу запроса.'
    );
  }
  return (
    `Сбой в кабинете: ${request}. Код обращения — ${context.requestId}. ` +
    'Посмотрите логи Railway по этому коду.'
  );
}
