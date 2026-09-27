import { describe, expect, it } from 'vitest';
import { formatKindLabel, formatLast24h, formatSourceLabel } from './devErrorsFormat';

describe('formatKindLabel', () => {
  it('поднимает первую букву каждого вида', () => {
    expect(formatKindLabel('render')).toBe('Экран не нарисовался');
    expect(formatKindLabel('unhandled')).toBe('Ошибка вне рендера');
    expect(formatKindLabel('chunk')).toBe('Не догрузился код экрана');
    expect(formatKindLabel('server')).toBe('Ошибка сервера');
  });
});

describe('formatSourceLabel', () => {
  it('browser — «Браузер», server — «Сервер»', () => {
    expect(formatSourceLabel('browser')).toBe('Браузер');
    expect(formatSourceLabel('server')).toBe('Сервер');
  });
});

describe('formatLast24h', () => {
  it('0 — честное пустое состояние, без «0 сбоев»', () => {
    expect(formatLast24h(0)).toBe('За сутки сбоев не было.');
  });

  it('1 — «сбой», единственное число', () => {
    expect(formatLast24h(1)).toBe('За последние сутки — **1 сбой**.');
  });

  it('3 — «сбоя», склонение few', () => {
    expect(formatLast24h(3)).toBe('За последние сутки — **3 сбоя**.');
  });

  it('5 — «сбоев», склонение many', () => {
    expect(formatLast24h(5)).toBe('За последние сутки — **5 сбоев**.');
  });

  it('21 — «сбой» (Intl.PluralRules(ru) даёт one для 21, не по остатку от 10)', () => {
    expect(formatLast24h(21)).toBe('За последние сутки — **21 сбой**.');
  });
});
