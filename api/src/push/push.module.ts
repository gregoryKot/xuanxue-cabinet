// Модуль push (ADR-0092): хранение подписок, выдача публичного ключа
// («Порядок работ» PR №3) и отправка — PushSenderService, VAPID-подпись на
// встроенном crypto (PR №4). PushExamNotifier (плечо-нотификатор) не здесь:
// он собирается в ExamsModule, тем же приёмом, что InAppExamNotifier/
// TelegramExamNotifier — провайдер модуля, которому нужен ExamNotifier, а не
// этого; PushModule лишь экспортирует PushSenderService ему навстречу.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PushKeyController } from './push-key.controller';
import { PushSenderService } from './push-sender.service';
import {
  PushSubscriptionRecord,
  PushSubscriptionSchema,
} from './push-subscription.schema';
import { PushSubscriptionsController } from './push-subscriptions.controller';
import { PushSubscriptionsService } from './push-subscriptions.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PushSubscriptionRecord.name, schema: PushSubscriptionSchema },
    ]),
  ],
  controllers: [PushSubscriptionsController, PushKeyController],
  providers: [PushSubscriptionsService, PushSenderService],
  exports: [MongooseModule, PushSubscriptionsService, PushSenderService],
})
export class PushModule {}
