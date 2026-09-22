// Переключение тега и список выбранных — чистая логика поля тегов
// (TagsField.tsx), тест без DOM (CLAUDE.md «Чистая логика»).
import { describe, expect, it } from 'vitest';
import { selectedTagOptions, toggleTagInText } from './tagToggle';

describe('toggleTagInText', () => {
  it('пустая строка — тег добавляется первым', () => {
    expect(toggleTagInText('', 'старшая')).toBe('старшая');
  });

  it('тега ещё нет — добавляет его в конец', () => {
    expect(toggleTagInText('ян, база', 'разминка')).toBe('ян, база, разминка');
  });

  it('тег уже есть — убирает его, остальные остаются', () => {
    expect(toggleTagInText('ян, база, разминка', 'база')).toBe('ян, разминка');
  });

  it('регистр не совпадает — тег всё равно находится и снимается', () => {
    expect(toggleTagInText('Старшая, база', 'старшая')).toBe('база');
  });

  it('единственный тег — снятие даёт пустую строку', () => {
    expect(toggleTagInText('старшая', 'Старшая')).toBe('');
  });
});

describe('selectedTagOptions', () => {
  it('пустая строка — ничего не выбрано', () => {
    expect(selectedTagOptions('', ['старшая', 'база'])).toEqual([]);
  });

  it('находит выбранные теги без учёта регистра, порядок — как в options', () => {
    expect(selectedTagOptions('База, ян', ['ян', 'старшая', 'база'])).toEqual([
      'ян',
      'база',
    ]);
  });

  it('тег в строке, которого нет среди options — не попадает в выбранные', () => {
    expect(selectedTagOptions('незнакомый', ['старшая', 'база'])).toEqual([]);
  });
});
