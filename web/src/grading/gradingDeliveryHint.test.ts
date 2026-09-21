import { describe, expect, it } from 'vitest';
import { gradingDeliveryHint } from './gradingDeliveryHint';

describe('gradingDeliveryHint', () => {
  it('у ученика активный Telegram — строка про доставку в Telegram', () => {
    expect(gradingDeliveryHint(true)).toBe(
      'Итог и комментарий уйдут ученику в Telegram сразу после отправки.',
    );
  });

  it('у ученика нет активного Telegram — строка про «Задания» в кабинете', () => {
    expect(gradingDeliveryHint(false)).toBe(
      'Итог и комментарий в Telegram не уйдут — ученик увидит их в кабинете, на «Заданиях».',
    );
  });
});
