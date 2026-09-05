import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChannelRecord, ChannelSchema } from './channel.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ChannelRecord.name, schema: ChannelSchema }]),
  ],
  exports: [MongooseModule],
})
export class ChannelsModule {}
