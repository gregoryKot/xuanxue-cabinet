// Тело PATCH /me/notifications — один переключатель за раз (ТЗ
// notifications-api.md). userId в теле нет и не будет: владелец — сессия
// (@CurrentUser в контроллере), не поле формы — иначе один человек мог бы
// переключить уведомления другому. `whitelist: true` (app.setup.ts) без
// этого поля в DTO молча отбросил бы чужой userId, даже если бот его пришлёт.
import { IsBoolean, IsIn } from 'class-validator';
import {
  NOTIFICATION_KINDS,
  type NotificationKind,
  type UpdateNotificationPrefsInput,
} from '@xuanxue/shared';

export class UpdateNotificationPrefsDto implements UpdateNotificationPrefsInput {
  @IsIn(NOTIFICATION_KINDS)
  kind!: NotificationKind;

  @IsBoolean()
  enabled!: boolean;
}
