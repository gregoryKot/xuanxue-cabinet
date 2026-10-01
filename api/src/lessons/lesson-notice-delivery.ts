// Доставка одной строки ленты о занятии — общая часть двух шагов тика:
// «Занятие скоро» (ADR-0135) и «Занятие отменено» (ADR-0162). Отдельным
// модулем, а не копией в обоих сервисах: порядок «вставил строку — тогда push»
// и правило «сбой одного человека не останавливает остальных» держатся в одном
// месте (CLAUDE.md «Одна механика — один компонент», jscpd).
import type { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { errorMessage, errorStack } from '../common/error-info';
import type { WriteInput } from '../notifications/in-app-staff-write';
import { insertNotificationRowOnce } from '../notifications/notification-row-once';
import type { NotificationRecord } from '../notifications/notification.schema';
import type { PushSenderService } from '../push/push-sender.service';

export interface NoticeDelivery {
  model: Model<NotificationRecord>;
  pushSender: PushSenderService;
  logger: Logger;
}

/** Вставляет строку ленты и, только если вставил её этот вызов, шлёт push:
 * второй тик или второй инстанс при деплое упираются в уникальный индекс
 * (userId, kind, lessonId) и дубля не присылают. `true` — строка вставлена и
 * push отправлен. Сбой на одном человеке — `error` со стеком и `false`: тихий
 * отказ рассылки — самая дорогая ошибка (CLAUDE.md «Логи»), а остальных
 * получателей он не должен останавливать. Строки нет — следующий тик
 * попробует снова. `what` — «что не записано», для строки лога. */
export async function insertRowAndPush(
  { model, pushSender, logger }: NoticeDelivery,
  input: WriteInput,
  now: DateTime,
  what: string,
): Promise<boolean> {
  try {
    const inserted = await insertNotificationRowOnce(model, input);
    if (!inserted) return false;
    await pushSender.sendToUser(input.userId, now);
    return true;
  } catch (error) {
    logger.error(`${what} не записано: ${errorMessage(error)}`, errorStack(error));
    return false;
  }
}
