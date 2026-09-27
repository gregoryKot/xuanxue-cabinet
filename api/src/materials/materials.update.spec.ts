// Юнит-тест buildMaterialUpdateCommand — чистая логика без Mongo и без DI
// (CLAUDE.md «Тесты»). Отдельный файл, не materials.service.spec.ts: логика
// вынесена в свой модуль (materials.update.ts) вместе с изменениями ADR-0133,
// а materials.service.spec.ts (623 строки) храповик размера файла запрещает
// пополнять — новый файл его не растит. `title`/`url` в `$set` — шифротекст
// (MATERIAL_ENCRYPT_SCHEMA, ENCRYPTION_KEY из test/jest.setup.ts), поэтому
// сравниваем через decryptRecord, а не строкой напрямую.
import { decryptRecord } from '../utils/encryption';
import { MATERIAL_ENCRYPT_SCHEMA } from './material.schema';
import { buildMaterialUpdateCommand } from './materials.update';

describe('buildMaterialUpdateCommand', () => {
  it('title без url — $set с полем (шифрованным), $unset не задан', () => {
    const command = buildMaterialUpdateCommand({ title: 'Новое название' });

    expect(command.$set.title).toBeDefined();
    expect(command.$set.title).not.toBe('Новое название');
    expect(decryptRecord(command.$set, MATERIAL_ENCRYPT_SCHEMA).title).toBe(
      'Новое название',
    );
    expect(command.$unset).toBeUndefined();
  });

  // ADR-0133: `url: null` — явный сброс ссылки, материал остаётся с файлом.
  it('url: null — уходит в $unset, а не в $set', () => {
    const command = buildMaterialUpdateCommand({ url: null });

    expect(command.$unset).toEqual({ url: '' });
    expect(command.$set).not.toHaveProperty('url');
  });

  it('url со значением — уходит в $set (шифрованным), $unset не задан', () => {
    const command = buildMaterialUpdateCommand({ url: 'https://example.com/new' });

    expect(decryptRecord(command.$set, MATERIAL_ENCRYPT_SCHEMA).url).toBe(
      'https://example.com/new',
    );
    expect(command.$unset).toBeUndefined();
  });

  it('url не прислали — ни $set, ни $unset его не трогают', () => {
    const command = buildMaterialUpdateCommand({ title: 'Только название' });

    expect(command.$set).not.toHaveProperty('url');
    expect(command.$unset).toBeUndefined();
  });

  // Тот же принцип, что у lessons.update.ts: PATCH без тегов не должен
  // затирать прежние пустым нормализованным массивом.
  it('tags не присланы — не попадают в команду', () => {
    const command = buildMaterialUpdateCommand({ title: 'x' });

    expect(command.$set).not.toHaveProperty('tags');
  });

  it('tags присланы — нормализуются (обрезка, дедуп без учёта регистра)', () => {
    const command = buildMaterialUpdateCommand({
      tags: ['  Старшая ', 'старшая', 'разминка  группа'],
    });

    expect(command.$set.tags).toEqual(['Старшая', 'разминка группа']);
  });

  it('url: null вместе с title — оба применяются в своих ветках', () => {
    const command = buildMaterialUpdateCommand({ title: 'Готово', url: null });

    expect(decryptRecord(command.$set, MATERIAL_ENCRYPT_SCHEMA).title).toBe('Готово');
    expect(command.$unset).toEqual({ url: '' });
  });
});
