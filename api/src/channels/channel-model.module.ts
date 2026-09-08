// Только регистрация модели ChannelRecord, без контроллера/сервиса —
// разрывает цикл ClassesModule ↔ ChannelsModule (ADR-0013, тот же приём, что
// LessonModelModule): ClassesService.create() подставляет активные
// Telegram-каналы новому занятию по умолчанию (fix «новое занятие без
// каналов»), для этого ему нужна модель ChannelRecord. ChannelsModule уже
// импортирует ClassesModule целиком ради ClassRecord — если бы ClassesModule
// в ответ импортировал ChannelsModule, Nest не разрешил бы граф. Модель
// регистрируется один раз (CLAUDE.md «Файлы»).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChannelRecord, ChannelSchema } from './channel.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ChannelRecord.name, schema: ChannelSchema }]),
  ],
  exports: [MongooseModule],
})
export class ChannelModelModule {}
