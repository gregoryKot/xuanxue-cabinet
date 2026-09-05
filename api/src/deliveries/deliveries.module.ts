import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeliveryRecord, DeliverySchema } from './delivery.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: DeliveryRecord.name, schema: DeliverySchema }]),
  ],
  exports: [MongooseModule],
})
export class DeliveriesModule {}
