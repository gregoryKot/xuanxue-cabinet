import { describe, expect, it } from 'vitest';
import {
  formatPosterBackfillIntro,
  formatPosterBackfillStatus,
  type PosterBackfillView,
} from './examVideoPosterBackfillText';

function view(overrides: Partial<PosterBackfillView>): PosterBackfillView {
  return { phase: 'running', done: 0, failed: 0, total: null, error: null, ...overrides };
}

describe('formatPosterBackfillIntro', () => {
  it.each([null, 0, -1])('%s — снимать нечего, текста нет', (count) => {
    expect(formatPosterBackfillIntro(count)).toBeNull();
  });

  it('число выделено акцентом, объяснено откуда оно и что видит ученик', () => {
    const text = formatPosterBackfillIntro(54);

    expect(text).toContain('**54 видео**');
    expect(text).toContain('до того, как кабинет стал снимать кадр');
    expect(text).toContain('чёрную плитку');
  });
});

describe('formatPosterBackfillStatus', () => {
  it('до нажатия строки нет', () => {
    expect(formatPosterBackfillStatus(view({ phase: 'idle' }))).toBeNull();
  });

  it('идёт прогон — «снято N из M»', () => {
    expect(formatPosterBackfillStatus(view({ done: 12, total: 54 }))).toBe(
      'Снято **12 из 54**',
    );
  });

  it('прогон только начался — ноль из M, а не пустота', () => {
    expect(formatPosterBackfillStatus(view({ total: 54 }))).toBe('Снято **0 из 54**');
  });

  it('итога ещё нет — только сколько снято', () => {
    expect(formatPosterBackfillStatus(view({ done: 3 }))).toBe('Снято **3**');
  });

  it('идёт прогон и часть не вышла — число неудач рядом', () => {
    expect(formatPosterBackfillStatus(view({ done: 12, failed: 2, total: 54 }))).toBe(
      'Снято **12 из 54**, не вышло **2**',
    );
  });

  it('готово без неудач', () => {
    expect(formatPosterBackfillStatus(view({ phase: 'done', done: 54, total: 54 }))).toBe(
      'Готово: снято **54**',
    );
  });

  it('готово, часть не вышла — причина и что попробовать', () => {
    const text = formatPosterBackfillStatus(
      view({ phase: 'done', done: 50, failed: 4, total: 54 }),
    );

    expect(text).toBe(
      'Снято **50**, не вышло **4** — этот браузер не открывает их формат. Попробуйте с Mac или iPhone.',
    );
  });

  it('не вышло всё — без «снято 0»', () => {
    expect(formatPosterBackfillStatus(view({ phase: 'done', failed: 4, total: 4 }))).toBe(
      'Не вышло снять **4** — этот браузер не открывает их формат. Попробуйте с Mac или iPhone.',
    );
  });

  it('список оказался пуст — честное «снимать нечего», не «снято 0»', () => {
    expect(formatPosterBackfillStatus(view({ phase: 'done', total: 0 }))).toBe(
      'Снимать нечего: у всех видео кадр уже есть.',
    );
  });

  it('ошибка важнее счётчиков', () => {
    expect(
      formatPosterBackfillStatus(
        view({ phase: 'done', done: 5, error: 'Нет доступа. Войдите заново.' }),
      ),
    ).toBe('Нет доступа. Войдите заново.');
  });
});
