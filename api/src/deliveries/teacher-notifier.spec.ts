// Заглушка до бота — единственное поведение стоит проверить: не бросает и
// не молчит (CLAUDE.md «Логи»: тихий отказ — самая дорогая ошибка).
import { LogTeacherNotifier } from './teacher-notifier';

describe('LogTeacherNotifier', () => {
  it('не бросает и резолвится', async () => {
    const notifier = new LogTeacherNotifier();
    await expect(
      notifier.notifyDeliveryFailed({
        deliveryId: 'd1',
        broadcastId: 'b1',
        channelId: 'c1',
        error: 'чат не найден',
      }),
    ).resolves.toBeUndefined();
  });
});
