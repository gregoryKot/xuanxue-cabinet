// Модуль уведомлений (ТЗ notifications-api.md) — первый слой: типы,
// дефолты по роли, настройка. Отправка (планировщик, бот, кнопка
// «Исправить») — следующий PR, у него будет свой модуль/сервис поверх этого.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationPrefsController } from './notification-prefs.controller';
import {
  NotificationPrefsRecord,
  NotificationPrefsSchema,
} from './notification-prefs.schema';
import { NotificationPrefsService } from './notification-prefs.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotificationPrefsRecord.name, schema: NotificationPrefsSchema },
    ]),
  ],
  controllers: [NotificationPrefsController],
  providers: [NotificationPrefsService],
  exports: [MongooseModule, NotificationPrefsService],
})
export class NotificationsModule {}
