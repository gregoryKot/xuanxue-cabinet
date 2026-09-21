// Модуль подписок на push (ADR-0092, «Порядок работ» PR №3): хранение,
// выдача публичного ключа. Отправка (плечо-нотификатор, VAPID-подпись) —
// PR №4, соберётся вокруг PushSubscriptionsService так же, как
// InAppExamNotifier вокруг NotificationsModule.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PushKeyController } from './push-key.controller';
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
  providers: [PushSubscriptionsService],
  exports: [MongooseModule, PushSubscriptionsService],
})
export class PushModule {}
