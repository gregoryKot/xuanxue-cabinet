// Только регистрация модели DeliveryRecord, без контроллера/сервиса —
// разрывает цикл BroadcastsModule ↔ DeliveriesModule тем же приёмом, что
// broadcast-model.module.ts (ADR-0013): комментарий и причина — там же.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeliveryRecord, DeliverySchema } from './delivery.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: DeliveryRecord.name, schema: DeliverySchema }]),
  ],
  exports: [MongooseModule],
})
export class DeliveryModelModule {}
