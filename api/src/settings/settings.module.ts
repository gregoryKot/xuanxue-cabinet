import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SettingsRecord, SettingsSchema } from './settings.schema';
import { SettingsService } from './settings.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SettingsRecord.name, schema: SettingsSchema }]),
  ],
  providers: [SettingsService],
  exports: [MongooseModule, SettingsService],
})
export class SettingsModule {}
