import { describe, expect, it } from 'vitest';
import { splitTextAccents } from './textAccents';

// Склейка `text` всех кусков должна давать исходную строку, только без
// снятых маркеров у распознанных пар — эта проверка идёт отдельным
// сравнением на каждый кейс с акцентом.
describe('splitTextAccents', () => {
  it('строка без маркеров — один кусок без accent', () => {
    expect(splitTextAccents('Повторите форму дыхания')).toEqual([
      { text: 'Повторите форму дыхания' },
    ]);
  });

  it('один акцент в середине строки', () => {
    expect(splitTextAccents('Держите **спину прямо** весь подход')).toEqual([
      { text: 'Держите ' },
      { text: 'спину прямо', accent: true },
      { text: ' весь подход' },
    ]);
  });

  it('два акцента в одной строке', () => {
    expect(splitTextAccents('**Вдох** и **выдох** ровные')).toEqual([
      { text: 'Вдох', accent: true },
      { text: ' и ' },
      { text: 'выдох', accent: true },
      { text: ' ровные' },
    ]);
  });

  it('акцент в самом начале строки — без пустого куска перед ним', () => {
    expect(splitTextAccents('**Важно** прочитать целиком')).toEqual([
      { text: 'Важно', accent: true },
      { text: ' прочитать целиком' },
    ]);
  });

  it('акцент в самом конце строки — без пустого куска после него', () => {
    expect(splitTextAccents('Смотрите видео **целиком**')).toEqual([
      { text: 'Смотрите видео ' },
      { text: 'целиком', accent: true },
    ]);
  });

  it('непарный маркер остаётся обычным текстом как есть', () => {
    const input = 'Отступ в **два счёта, не больше';
    expect(splitTextAccents(input)).toEqual([{ text: input }]);
  });

  it('пустая середина **** остаётся обычным текстом', () => {
    const input = 'Пауза **** между подходами';
    expect(splitTextAccents(input)).toEqual([{ text: input }]);
  });

  it('склейка кусков даёт исходную строку без снятых маркеров', () => {
    const input = '**Раз** — вдох, **два** — выдох, **три** — пауза';
    const parts = splitTextAccents(input);

    expect(parts.map((part) => part.text).join('')).toBe(
      'Раз — вдох, два — выдох, три — пауза',
    );
  });

  it('в результате не бывает пустых кусков', () => {
    const parts = splitTextAccents('**a****b**');

    expect(parts.every((part) => part.text.length > 0)).toBe(true);
  });
});
