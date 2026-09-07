// Только регистрация модели BroadcastRecord, без контроллера/сервиса — тот
// же приём, что у lesson-model.module.ts (ADR-0013): DeliveriesModule нужна
// модель рассылки (refreshBroadcastStatus, mark-sent), BroadcastsModule нужна
// модель доставки (createManual) — если оба домена импортировали бы друг
// друга целиком, Nest не смог бы разрешить граф. Модель регистрируется один
// раз (CLAUDE.md «Файлы»), оба домена берут её отсюда.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BroadcastRecord, BroadcastSchema } from './broadcast.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: BroadcastRecord.name, schema: BroadcastSchema }]),
  ],
  exports: [MongooseModule],
})
export class BroadcastModelModule {}
