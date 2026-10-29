import { describe, expect, it } from 'vitest';
import {
  formatCodecBackfillIntro,
  formatCodecBackfillStatus,
  type CodecBackfillView,
} from './examVideoCodecBackfillText';

function view(overrides: Partial<CodecBackfillView>): CodecBackfillView {
  return {
    phase: 'running',
    converted: 0,
    alreadyH264: 0,
    failed: 0,
    total: null,
    error: null,
    ...overrides,
  };
}

describe('formatCodecBackfillIntro', () => {
  it.each([null, 0, -1])('%s — перегонять нечего, текста нет', (count) => {
    expect(formatCodecBackfillIntro(count)).toBeNull();
  });

  it('объясняет до нажатия: что не так, что сделает кабинет, откуда запускать и что с оригиналами', () => {
    const text = formatCodecBackfillIntro(12);

    expect(text).toContain('**12 видео**');
    expect(text).toContain('HEVC');
    expect(text).toContain('у части учеников оно не открывается');
    expect(text).toContain('обычный MP4');
    expect(text).toContain('**Mac или iPhone**');
    expect(text).toContain('не закрывайте вкладку');
    expect(text).toContain('Оригиналы остаются на месте');
  });
});

describe('formatCodecBackfillStatus', () => {
  it('до нажатия строки нет', () => {
    expect(formatCodecBackfillStatus(view({ phase: 'idle' }))).toBeNull();
  });

  it('идёт прогон — «перегнано N из M»', () => {
    expect(formatCodecBackfillStatus(view({ converted: 3, total: 12 }))).toBe(
      'Перегнано **3 из 12**',
    );
  });

  it('уже H.264 идут в ту же долю: видео теперь открывается везде', () => {
    expect(
      formatCodecBackfillStatus(view({ converted: 3, alreadyH264: 4, total: 12 })),
    ).toBe('Перегнано **7 из 12**');
  });

  it('прогон только начался — ноль из M, а не пустота', () => {
    expect(formatCodecBackfillStatus(view({ total: 12 }))).toBe('Перегнано **0 из 12**');
  });

  it('итога ещё нет — только сколько перегнано', () => {
    expect(formatCodecBackfillStatus(view({ converted: 2 }))).toBe('Перегнано **2**');
  });

  it('идёт прогон и часть не вышла — число неудач рядом', () => {
    expect(formatCodecBackfillStatus(view({ converted: 3, failed: 2, total: 12 }))).toBe(
      'Перегнано **3 из 12**, не вышло **2**',
    );
  });

  it('готово без неудач', () => {
    expect(
      formatCodecBackfillStatus(view({ phase: 'done', converted: 12, total: 12 })),
    ).toBe('Готово: перегнано **12**');
  });

  it('готово, часть уже была в H.264 — отдельным числом', () => {
    expect(
      formatCodecBackfillStatus(
        view({ phase: 'done', converted: 8, alreadyH264: 4, total: 12 }),
      ),
    ).toBe('Готово: перегнано **8**, **4** уже в обычном MP4');
  });

  it('готово, все уже были в H.264 — без «перегнано 0»', () => {
    expect(
      formatCodecBackfillStatus(view({ phase: 'done', alreadyH264: 5, total: 5 })),
    ).toBe('Готово: **5** уже в обычном MP4');
  });

  it('готово, часть не вышла — оригиналы целы, причина и что делать', () => {
    expect(
      formatCodecBackfillStatus(
        view({ phase: 'done', converted: 8, alreadyH264: 2, failed: 2, total: 12 }),
      ),
    ).toBe(
      'Перегнано **8**, **2** уже в обычном MP4, не вышло **2** — оригиналы целы. Этот браузер не умеет читать HEVC. Запустите с Mac или iPhone.',
    );
  });

  it('не вышло всё — без «перегнано 0»', () => {
    expect(formatCodecBackfillStatus(view({ phase: 'done', failed: 4, total: 4 }))).toBe(
      'Не вышло **4** — оригиналы целы. Этот браузер не умеет читать HEVC. Запустите с Mac или iPhone.',
    );
  });

  it('список оказался пуст — честное «перегонять нечего», не «перегнано 0»', () => {
    expect(formatCodecBackfillStatus(view({ phase: 'done', total: 0 }))).toBe(
      'Перегонять нечего: все видео уже в обычном MP4.',
    );
  });

  it('ошибка важнее счётчиков', () => {
    expect(
      formatCodecBackfillStatus(
        view({ phase: 'done', converted: 5, error: 'Нет доступа. Войдите заново.' }),
      ),
    ).toBe('Нет доступа. Войдите заново.');
  });
});
