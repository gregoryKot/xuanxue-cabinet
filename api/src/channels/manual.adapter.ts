// ChannelAdapter для ручного режима (Facebook, Boosty — API закрыт или не
// нужен, PLAN §6/§8): доставку всегда завершает человек кнопкой «скопировал,
// отправил», сеть сюда не ходит.
import { Injectable } from '@nestjs/common';
import type { ChannelType } from '@xuanxue/shared';
import type { ChannelAdapter, OutgoingMessage, SendResult } from './channel-adapter';

@Injectable()
export class ManualAdapter implements ChannelAdapter {
  readonly type: ChannelType = 'manual';

  // Не `async` — ходить в сеть незачем, но контракт ChannelAdapter.send
  // общий для всех адаптеров и возвращает Promise.
  send(_message: OutgoingMessage): Promise<SendResult> {
    return Promise.resolve({ status: 'manual' });
  }
}
