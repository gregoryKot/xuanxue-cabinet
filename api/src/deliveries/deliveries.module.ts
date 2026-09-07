// GET /deliveries/:id, POST /deliveries/:id/mark-sent (docs/PLAN.md §6
// «Доставка»). BroadcastModelModule — не BroadcastsModule целиком: тот сам
// нуждается в DeliveryModelModule (createManual создаёт deliveries pending)
// — импорт друг друга целиком замкнул бы цикл (ADR-0013, комментарий в
// broadcasts.module.ts).
import { Module } from '@nestjs/common';
import { BroadcastModelModule } from '../broadcasts/broadcast-model.module';
import { ChannelsModule } from '../channels/channels.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { DeliveryModelModule } from './delivery-model.module';

@Module({
  imports: [DeliveryModelModule, BroadcastModelModule, ChannelsModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
  exports: [DeliveryModelModule],
})
export class DeliveriesModule {}
