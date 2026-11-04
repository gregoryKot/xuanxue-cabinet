import { describe, expect, it } from 'vitest';
import { DEFAULT_GROUP_NAMES, groupNameKey } from './groups';

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
