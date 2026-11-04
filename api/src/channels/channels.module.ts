// Провайдеры адаптеров идут через multi-провайдер CHANNEL_ADAPTERS — в Nest
// нет декларативного «multi: true», поэтому фабрика собирает массив вручную
// (ADR-0004). GroupModelModule — модель групп: create()/update() проверяют
// `groupIds` канала (ADR-0196).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GroupModelModule } from '../groups/group-model.module';
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
    GroupModelModule,
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
  // ChannelAdapterRegistry — тоже наружу: DeliveryRunnerService
  // (api/src/deliveries/, планировщик доставки, docs/PLAN.md §6) шлёт через
  // тот же реестр адаптеров, не заводит свой.
  exports: [
    MongooseModule,
    ChannelsService,
    ChannelConfigService,
    ChannelAdapterRegistry,
  ],
})
export class ChannelsModule {}
