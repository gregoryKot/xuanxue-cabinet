import { describe, expect, it } from 'vitest';
import {
  TARGET_VIDEO_BITRATE,
  isWorthCompressing,
  planVideoCompression,
  shouldUseCompressed,
} from './videoCompressionPlan';

const MIB = 1024 * 1024;

function plan(displayWidth: number, displayHeight: number, frameRate = 30) {
  return planVideoCompression({
    sizeBytes: 100 * MIB,
    displayWidth,
    displayHeight,
    frameRate,
  });
}

describe('isWorthCompressing', () => {
  it('до 8 МиБ включительно не стоит: это одна часть загрузки', () => {
    expect(isWorthCompressing(8 * MIB)).toBe(false);
    expect(isWorthCompressing(8 * MIB + 1)).toBe(true);
  });

  it('пустой файл — нечего сжимать', () => {
    expect(isWorthCompressing(0)).toBe(false);
  });
});

describe('planVideoCompression — размер кадра', () => {
  it('1080p в ландшафте — 1280×720', () => {
    expect(plan(1920, 1080)).toMatchObject({ width: 1280, height: 720 });
  });

  it('4K в ландшафте — 1280×720', () => {
    expect(plan(3840, 2160)).toMatchObject({ width: 1280, height: 720 });
  });

  it('вертикальное видео — 720×1280, а не 1280×720', () => {
    expect(plan(1080, 1920)).toMatchObject({ width: 720, height: 1280 });
  });

  it('кадр с поворотом из метаданных идёт по размерам зрителя', () => {
    // Телефон пишет 1920×1080 с поворотом на 90°: зритель видит 1080×1920.
    expect(plan(1080, 1920)).toMatchObject({ width: 720, height: 1280 });
  });

  it('4:3 упирается в короткую сторону: 1280×960 → 960×720', () => {
    expect(plan(1280, 960)).toMatchObject({ width: 960, height: 720 });
  });

  it('никогда не увеличивает: 640×480 остаётся 640×480', () => {
    expect(plan(640, 480)).toMatchObject({ width: 640, height: 480 });
  });

  it('нечётные стороны округляются вниз до чётных', () => {
    expect(plan(1001, 563)).toMatchObject({ width: 1000, height: 562 });
  });

  it('очень узкий кадр не схлопывается в ноль', () => {
    expect(plan(4000, 1)).toMatchObject({ height: 2 });
  });

  it.each([
    [0, 1080],
    [1920, 0],
    [Number.NaN, 1080],
    [-1, -1],
  ])('размер кадра %s×%s не прочитан — плана нет', (width, height) => {
    expect(plan(width, height)).toBeNull();
  });
});

describe('planVideoCompression — битрейт и частота кадров', () => {
  it('битрейт — около 2 Мбит/с', () => {
    expect(plan(1920, 1080)?.bitrate).toBe(TARGET_VIDEO_BITRATE);
  });

  it('до 30 кадров/с частоту не трогаем, у 24 кадров своя', () => {
    expect(plan(1920, 1080, 30)).not.toHaveProperty('frameRate');
    expect(plan(1920, 1080, 24)).not.toHaveProperty('frameRate');
  });

  it('60 кадров/с режется до 30', () => {
    expect(plan(1920, 1080, 60)).toMatchObject({ frameRate: 30 });
  });

  it('частота не прочитана — на всякий случай ограничиваем 30', () => {
    expect(plan(1920, 1080, 0)).toMatchObject({ frameRate: 30 });
    expect(
      planVideoCompression({
        sizeBytes: 100 * MIB,
        displayWidth: 1920,
        displayHeight: 1080,
      }),
    ).toMatchObject({ frameRate: 30 });
  });
});

describe('shouldUseCompressed', () => {
  it('берёт результат, только если он меньше 80% исходника', () => {
    expect(shouldUseCompressed(100, 79)).toBe(true);
    expect(shouldUseCompressed(100, 80)).toBe(false);
    expect(shouldUseCompressed(100, 120)).toBe(false);
  });

  it('пустой результат не берёт', () => {
    expect(shouldUseCompressed(100, 0)).toBe(false);
  });
});
