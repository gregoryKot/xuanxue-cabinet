// Чистая логика, без Mongo (CLAUDE.md «Тесты»): образец —
// exam-media-notifier.registry.spec.ts.
import type { PaymentScreenshotDeliveryPort } from './payment-screenshot-delivery.port';
import { PaymentScreenshotDeliveryRegistry } from './payment-screenshot-delivery.registry';

function fakePort(): PaymentScreenshotDeliveryPort {
  return { deliverUploaded: jest.fn().mockResolvedValue(undefined) };
}

describe('PaymentScreenshotDeliveryRegistry', () => {
  it('порт не зарегистрирован — getOrNull() отдаёт null, не бросает', () => {
    expect(new PaymentScreenshotDeliveryRegistry().getOrNull()).toBeNull();
  });

  it('после регистрации возвращает зарегистрированную реализацию', () => {
    const registry = new PaymentScreenshotDeliveryRegistry();
    const port = fakePort();

    registry.set(port);

    expect(registry.getOrNull()).toBe(port);
  });

  it('у двух реестров состояние своё', () => {
    const first = new PaymentScreenshotDeliveryRegistry();
    first.set(fakePort());

    expect(new PaymentScreenshotDeliveryRegistry().getOrNull()).toBeNull();
  });
});
