// GET /summary (docs/PLAN.md §6). BroadcastModelModule/DeliveryModelModule —
// только модели, не BroadcastsModule/DeliveriesModule целиком (та же причина,
// что у cancelBroadcast: цикла не нужно, сводке нужны лишь данные для чтения).
// ChannelsModule — так же ради своей модели.
import { Module } from '@nestjs/common';
import { BroadcastModelModule } from '../broadcasts/broadcast-model.module';
import { ChannelsModule } from '../channels/channels.module';
import { DeliveryModelModule } from '../deliveries/delivery-model.module';
import { SummaryController } from './summary.controller';
import { SummaryService } from './summary.service';

@Module({
  imports: [BroadcastModelModule, DeliveryModelModule, ChannelsModule],
  controllers: [SummaryController],
  providers: [SummaryService],
})
export class SummaryModule {}
