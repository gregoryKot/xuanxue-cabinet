// Выбор адаптера по типу канала — единственное место, знающее про все три
// реализации (ADR-0004). `ChannelsService` и будущий сервис доставок берут
// адаптер только отсюда, не импортируют конкретные классы напрямую.
import { Inject, Injectable } from '@nestjs/common';
import type { ChannelType } from '@xuanxue/shared';
import { NotAvailableError } from '../common/errors';
import { CHANNEL_ADAPTERS, type ChannelAdapter } from './channel-adapter';

@Injectable()
export class ChannelAdapterRegistry {
  private readonly byType: ReadonlyMap<ChannelType, ChannelAdapter>;

  constructor(@Inject(CHANNEL_ADAPTERS) adapters: ChannelAdapter[]) {
    this.byType = new Map(adapters.map((adapter) => [adapter.type, adapter]));
  }

  get(type: ChannelType): ChannelAdapter {
    const adapter = this.byType.get(type);
    if (!adapter) {
      // `vk` — тип в перечислении есть, но адаптер в CHANNEL_ADAPTERS ещё не
      // включён (channels.module.ts). Не вина клиента и не 500 — сервис сам
      // ещё не готов обслужить этот тип.
      throw new NotAvailableError(`Канал типа «${type}» пока не поддерживается`);
    }
    return adapter;
  }
}
