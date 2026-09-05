import { describe, expect, it } from 'vitest';
import { formatDurationRu } from './format-duration';

describe('formatDurationRu', () => {
  it.each([
    [30, '30 минут'],
    [45, '45 минут'],
    [60, '1 час'],
    [90, '1,5 часа'],
    [120, '2 часа'],
    [150, '2,5 часа'],
    [180, '3 часа'],
    [300, '5 часов'],
    [21, '21 минута'],
    [1, '1 минута'],
    [0, ''],
    [-10, ''],
    [Number.NaN, ''],
    [0.5, ''],
    // Правило по остатку от 10 дало бы здесь «111 минута».
    [111, '111 минут'],
    [1260, '21 час'],
    [660, '11 часов'],
    [630, '10,5 часа'],
  ])('%i минут → %s', (minutes, expected) => {
    expect(formatDurationRu(minutes)).toBe(expected);
  });
});
