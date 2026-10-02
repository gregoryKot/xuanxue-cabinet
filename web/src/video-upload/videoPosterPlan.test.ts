import { describe, expect, it } from 'vitest';
import { POSTER_TIMEOUT_MS, posterSeekTime, posterSize } from './videoPosterPlan';

describe('posterSize', () => {
  it('длинная сторона 480 px, пропорции сохраняются', () => {
    expect(posterSize(1920, 1080)).toEqual({ width: 480, height: 270 });
    expect(posterSize(1080, 1920)).toEqual({ width: 270, height: 480 });
  });

  it('никогда не увеличивает: 320×240 остаётся 320×240', () => {
    expect(posterSize(320, 240)).toEqual({ width: 320, height: 240 });
  });

  it('очень узкий кадр не схлопывается в ноль', () => {
    expect(posterSize(4000, 1)).toEqual({ width: 480, height: 1 });
  });

  it.each([
    [0, 1080],
    [1920, 0],
    [Number.NaN, 1080],
    [-1, -1],
  ])('размер %s×%s не прочитан — размера нет', (width, height) => {
    expect(posterSize(width, height)).toBeNull();
  });
});

describe('posterSeekTime', () => {
  it('обычный клип — 0,5 с, чтобы пропустить чёрные первые кадры', () => {
    expect(posterSeekTime(10)).toBe(0.5);
    expect(posterSeekTime(1)).toBe(0.5);
  });

  it('клип короче секунды — середина', () => {
    expect(posterSeekTime(0.4)).toBeCloseTo(0.2);
  });

  it.each([null, undefined, 0, -3, Number.NaN, Number.POSITIVE_INFINITY])(
    'длительность %s не известна — те же 0,5 с',
    (duration) => {
      expect(posterSeekTime(duration)).toBe(0.5);
    },
  );
});

describe('POSTER_TIMEOUT_MS', () => {
  it('пара секунд: украшение не держит загрузку дольше', () => {
    expect(POSTER_TIMEOUT_MS).toBeGreaterThanOrEqual(1000);
    expect(POSTER_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });
});
