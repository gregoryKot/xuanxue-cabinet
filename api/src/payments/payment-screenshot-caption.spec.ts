// Чистая логика, без Mongo и сети (CLAUDE.md «Тесты»).
import { paymentScreenshotCaption } from './payment-screenshot-caption';

describe('paymentScreenshotCaption', () => {
  it('первый снимок — обычная подпись с именем и месяцем словами', () => {
    expect(
      paymentScreenshotCaption({
        studentName: 'Ученик Иванов',
        month: '2026-09',
        replaced: false,
      }),
    ).toBe('Скриншот от Ученик Иванов — оплата за сентябрь 2026.');
  });

  it('замена — подпись говорит «взамен прежнего»', () => {
    expect(
      paymentScreenshotCaption({
        studentName: 'Ученик Иванов',
        month: '2026-09',
        replaced: true,
      }),
    ).toBe('Новый скриншот от Ученик Иванов взамен прежнего — оплата за сентябрь 2026.');
  });
});
