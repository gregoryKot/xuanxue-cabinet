import { describe, expect, it } from 'vitest';
import { firstLines } from './firstLines';

describe('firstLines', () => {
  it('текст в одну строку — возвращает как есть', () => {
    expect(firstLines('Через 30 минут занятие', 2)).toBe('Через 30 минут занятие');
  });

  it('обрезает по переносам строк, не по символам', () => {
    expect(firstLines('строка1\nстрока2\nстрока3', 2)).toBe('строка1\nстрока2');
  });

  it('строк меньше лимита — возвращает весь текст', () => {
    expect(firstLines('одна строка', 5)).toBe('одна строка');
  });
});
