import { describe, expect, it } from 'vitest';
import { NEW_PERSON_NAME, joinPersonName, splitPersonName } from './person-name';

describe('joinPersonName', () => {
  it('склеивает имя и фамилию через пробел', () => {
    expect(joinPersonName('Дмитрий', 'Котов')).toBe('Дмитрий Котов');
  });

  it('без фамилии — одно имя, без хвостового пробела', () => {
    expect(joinPersonName('Дмитрий')).toBe('Дмитрий');
    expect(joinPersonName('Дмитрий', '')).toBe('Дмитрий');
    expect(joinPersonName('Дмитрий', '   ')).toBe('Дмитрий');
  });

  it('обрезает пробелы по краям обеих частей', () => {
    expect(joinPersonName('  Мария ', '  Ли  ')).toBe('Мария Ли');
  });
});

describe('splitPersonName', () => {
  it('всё до первого пробела — имя, остальное фамилия', () => {
    expect(splitPersonName('Дмитрий Котов')).toEqual({
      firstName: 'Дмитрий',
      lastName: 'Котов',
    });
    expect(splitPersonName('Анна Мария Петрова')).toEqual({
      firstName: 'Анна',
      lastName: 'Мария Петрова',
    });
  });

  it('одно слово — только имя', () => {
    expect(splitPersonName('Гриша')).toEqual({ firstName: 'Гриша', lastName: '' });
  });

  it('заглушку нового человека не разбирает — форма открывается пустой', () => {
    expect(splitPersonName(NEW_PERSON_NAME)).toEqual({ firstName: '', lastName: '' });
  });

  it('пустая строка и пробелы — пустые поля', () => {
    expect(splitPersonName('')).toEqual({ firstName: '', lastName: '' });
    expect(splitPersonName('   ')).toEqual({ firstName: '', lastName: '' });
  });

  it('склейка и разбор — обратимая пара', () => {
    const parts = { firstName: 'Мария', lastName: 'Ли' };
    expect(splitPersonName(joinPersonName(parts.firstName, parts.lastName))).toEqual(
      parts,
    );
  });
});
