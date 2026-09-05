import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BroadcastRecord, BroadcastSchema } from './broadcast.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: BroadcastRecord.name, schema: BroadcastSchema }]),
  ],
  exports: [MongooseModule],
})
export class BroadcastsModule {}
