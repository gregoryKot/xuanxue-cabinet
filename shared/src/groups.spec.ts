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

describe('DEFAULT_GROUP_NAMES', () => {
  it('группы по умолчанию идут от новичков к старшим', () => {
    expect([...DEFAULT_GROUP_NAMES]).toEqual(['Начинающие', 'Средние', 'Старшие']);
  });
});

describe('joinGroupNames', () => {
  it('названия идут через запятую в переданном порядке — как первая строка поста', () => {
    expect(joinGroupNames(['Средние', 'Старшие'])).toBe('Средние, Старшие');
  });

  it('одна группа — её название без разделителя', () => {
    expect(joinGroupNames(['Начинающие'])).toBe('Начинающие');
  });

  it('без групп подпись пустая — занятие никуда не уходит, и в посте строки нет', () => {
    expect(joinGroupNames([])).toBe('');
  });
});
