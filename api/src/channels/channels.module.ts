// Провайдеры адаптеров идут через multi-провайдер CHANNEL_ADAPTERS — в Nest
// нет декларативного «multi: true», поэтому фабрика собирает массив вручную
// (ADR-0004). ClassesModule импортируется целиком ради модели ClassRecord
// (remove() проверяет classes.channelIds) — экспортирует MongooseModule, тот
// же приём, что LessonsModule ↔ ClassesModule (см. lesson-model.module.ts).
// ClassesModule каналы не импортирует — цикла нет.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClassesModule } from '../classes/classes.module';
import { CHANNEL_ADAPTERS } from './channel-adapter';
import { ChannelAdapterRegistry } from './channel-adapter.registry';
import { ChannelConfigService } from './channel-config.service';
import { ChannelRecord, ChannelSchema } from './channel.schema';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { ManualAdapter } from './manual.adapter';
import { TELEGRAM_CLIENT_FACTORY, createTelegramClient } from './telegram-client';
import { TelegramAdapter } from './telegram.adapter';
import { VkAdapter } from './vk.adapter';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ChannelRecord.name, schema: ChannelSchema }]),
    ClassesModule,
  ],
  controllers: [ChannelsController],
  providers: [
    ChannelsService,
    ChannelConfigService,
    ChannelAdapterRegistry,
    TelegramAdapter,
    VkAdapter,
    ManualAdapter,
    { provide: TELEGRAM_CLIENT_FACTORY, useValue: createTelegramClient },
    {
      provide: CHANNEL_ADAPTERS,
      useFactory: (telegram: TelegramAdapter, manual: ManualAdapter) => [
        telegram,
        manual,
      ],
      inject: [TelegramAdapter, ManualAdapter],
    },
  ],
  // ChannelAdapterRegistry — тоже наружу: DeliveryRunnerService (G1,
  // api/src/deliveries/) шлёт через тот же реестр адаптеров, не заводит свой.
  exports: [
    MongooseModule,
    ChannelsService,
    ChannelConfigService,
    ChannelAdapterRegistry,
  ],
})
export class ChannelsModule {}
