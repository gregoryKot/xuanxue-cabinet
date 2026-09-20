import { describe, expect, it } from 'vitest';
import { badgeLabel, badgeText } from './notificationBadge';

describe('badgeText', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [2, '2'],
    [5, '5'],
    [9, '9'],
    [10, '9+'],
    [100, '9+'],
  ])('%i → %s', (count, expected) => {
    expect(badgeText(count)).toBe(expected);
  });
});

describe('badgeLabel', () => {
  it('0 — без числа, просто «Уведомления»', () => {
    expect(badgeLabel(0)).toBe('Уведомления');
  });

  // Настоящее число даже за потолком пилюли ('9+' — только на самой пилюле).
  it.each([
    [1, 'Уведомления, 1 новое'],
    [2, 'Уведомления, 2 новых'],
    [5, 'Уведомления, 5 новых'],
    [9, 'Уведомления, 9 новых'],
    [10, 'Уведомления, 10 новых'],
    [100, 'Уведомления, 100 новых'],
  ])('%i → %s', (count, expected) => {
    expect(badgeLabel(count)).toBe(expected);
  });
});
