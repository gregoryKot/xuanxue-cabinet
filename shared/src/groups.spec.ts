import { describe, expect, it } from 'vitest';
import { DEFAULT_GROUP_NAMES, groupNameKey, joinGroupNames } from './groups';

describe('groupNameKey', () => {
  it('пробелы по краям и регистр не делают вторую группу', () => {
    expect(groupNameKey('  Средние ')).toBe('средние');
    expect(groupNameKey('СРЕДНИЕ')).toBe(groupNameKey('средние'));
  });

  it('пробелы внутри названия — часть названия', () => {
    expect(groupNameKey('Старшая группа')).toBe('старшая группа');
  });
});

describe('joinGroupNames', () => {
  it('названия через запятую в переданном порядке — первая строка поста', () => {
    expect(joinGroupNames(['Начинающие', 'Средние'])).toBe('Начинающие, Средние');
  });

  it('одна группа — без разделителя, ни одной — пустая подпись', () => {
    expect(joinGroupNames(['Старшие'])).toBe('Старшие');
    expect(joinGroupNames([])).toBe('');
  });

  it('группы по умолчанию идут от новичков к старшим', () => {
    expect(joinGroupNames(DEFAULT_GROUP_NAMES)).toBe('Начинающие, Средние, Старшие');
  });
});
