// Слой совместимости expand→contract для удалённого статуса `invited`
// (ADR-0035, миграция 0007-invited-users-active). Миграция одноразовая и
// переводит накопленных `invited`-людей в `active` до того, как раннер
// отпускает приложение слушать порт — но в окне деплоя старый инстанс (и
// код после revert-PR) ещё может записать `status: 'invited'` уже после
// того, как миграция отметилась применённой. Mongoose `.lean()` не
// валидирует на чтении: `findById` не упадёт и не вернёт null, а молча
// отдаст документ со статусом вне `USER_STATUSES` — без этого слоя такой
// документ навсегда остаётся вне контракта (`AuthGuard` его пропустит,
// `PersonalChats.chatFor` и `TeachersService` — потеряют, интерфейсу уедет
// значение вне enum).
//
// Решение владельца (ADR-0035, вариант «б»): неизвестный статус на чтении —
// `active`, не `blocked`. Такие люди уже входили в кабинет хотя бы раз;
// лишних школа блокирует вручную на «Людях» после деплоя — агент не решает
// это заранее за неё. Сами данные в базе чистит RUNBOOK-шаг после деплоя,
// этот файл ничего не переписывает — только меняет то, что видит вызывающий
// код.
import { Logger } from '@nestjs/common';
import { USER_STATUSES, type UserStatus } from '@xuanxue/shared';

const logger = new Logger('UserStatus');
const KNOWN_STATUSES: readonly string[] = USER_STATUSES;

function isKnownStatus(raw: unknown): raw is UserStatus {
  return typeof raw === 'string' && KNOWN_STATUSES.includes(raw);
}

/** userId — ObjectId, не ПДн, в лог можно (CLAUDE.md «Логи»). */
export function normalizeUserStatus(raw: unknown, userId: string): UserStatus {
  if (isKnownStatus(raw)) return raw;

  logger.warn(
    `user.status.unknown: статус «${String(raw)}» у пользователя ${userId} прочитан как active (ADR-0035, expand→contract)`,
  );
  return 'active';
}
