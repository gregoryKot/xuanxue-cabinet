// GET /summary (docs/PLAN.md §6). BroadcastModelModule/DeliveryModelModule —
// только модели, не BroadcastsModule/DeliveriesModule целиком (та же причина,
// что у cancelBroadcast: цикла не нужно, сводке нужны лишь данные для чтения).
// ChannelsModule/ClassesModule/LessonModelModule — так же ради своих моделей.
import { Module } from '@nestjs/common';
import { BroadcastModelModule } from '../broadcasts/broadcast-model.module';
import { ChannelsModule } from '../channels/channels.module';
import { ClassesModule } from '../classes/classes.module';
import { DeliveryModelModule } from '../deliveries/delivery-model.module';
import { LessonModelModule } from '../lessons/lesson-model.module';
import { SummaryController } from './summary.controller';
import { SummaryService } from './summary.service';

@Module({
  imports: [
    BroadcastModelModule,
    DeliveryModelModule,
    ChannelsModule,
    ClassesModule,
    LessonModelModule,
  ],
  controllers: [SummaryController],
  providers: [SummaryService],
})
export class SummaryModule {}
