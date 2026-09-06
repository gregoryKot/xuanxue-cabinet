import type { ChannelAdapter } from './channel-adapter';
import { ManualAdapter } from './manual.adapter';

describe('ManualAdapter', () => {
  it('всегда возвращает manual — доставку завершает человек кнопкой', async () => {
    const adapter: ChannelAdapter = new ManualAdapter();

    await expect(adapter.send({ text: 'x' }, {})).resolves.toEqual({ status: 'manual' });
  });
});
