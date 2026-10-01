// Юнит-тест buildMaterialCreateRecord и shouldAnnounceMaterial — чистая логика
// без Mongo и без DI (CLAUDE.md «Тесты»). Решение «объявлять ли материал
// ученикам» (ADR-0162): галочка учителя и открытый ученикам доступ, всё остальное
// — не объявлять.
import { DateTime } from 'luxon';
import { decryptRecord } from '../utils/encryption';
import { MATERIAL_ENCRYPT_SCHEMA } from './material.schema';
import { buildMaterialCreateRecord, shouldAnnounceMaterial } from './materials.create';

const NOW = DateTime.fromISO('2026-10-01T09:00:00Z', { zone: 'utc' });
const AUTHOR_ID = '65f1c0ffee0000000000a001';
const BASE = { title: 'Ван Пэйшэн', kind: 'book' } as const;

describe('shouldAnnounceMaterial', () => {
  it('галочка и доступ «все ученики» — объявлять', () => {
    expect(shouldAnnounceMaterial({ ...BASE, notifyStudents: true, access: 'all' })).toBe(
      true,
    );
  });

  // Доступ по умолчанию — `all` (MaterialsService.create): галочка без явного
  // доступа объявляет так же.
  it('галочка без доступа — доступ по умолчанию «все ученики», объявлять', () => {
    expect(shouldAnnounceMaterial({ ...BASE, notifyStudents: true })).toBe(true);
  });

  it('служебный материал — не объявлять, даже с галочкой', () => {
    expect(
      shouldAnnounceMaterial({ ...BASE, notifyStudents: true, access: 'staff' }),
    ).toBe(false);
  });

  // Клиент, который про галочку не знает, материал не рассылает.
  it('нет поля или галочка снята — не объявлять', () => {
    expect(shouldAnnounceMaterial({ ...BASE, access: 'all' })).toBe(false);
    expect(
      shouldAnnounceMaterial({ ...BASE, notifyStudents: false, access: 'all' }),
    ).toBe(false);
  });
});

describe('buildMaterialCreateRecord', () => {
  it('галочка и «все ученики» — announceAt равен now (UTC)', () => {
    const record = buildMaterialCreateRecord(
      { ...BASE, notifyStudents: true },
      AUTHOR_ID,
      NOW,
    );

    expect(record.announceAt).toEqual(NOW.toJSDate());
  });

  it('служебный, без галочки, с галочкой снятой — ключа announceAt нет вовсе', () => {
    const inputs = [
      { ...BASE, notifyStudents: true, access: 'staff' as const },
      { ...BASE },
      { ...BASE, notifyStudents: false },
    ];
    for (const input of inputs) {
      expect(buildMaterialCreateRecord(input, AUTHOR_ID, NOW)).not.toHaveProperty(
        'announceAt',
      );
    }
  });

  it('notifyStudents в документ не попадает: это команда, а не поле материала', () => {
    const record = buildMaterialCreateRecord(
      { ...BASE, notifyStudents: true },
      AUTHOR_ID,
      NOW,
    );

    expect(record).not.toHaveProperty('notifyStudents');
  });

  it('название зашифровано, теги нормализованы, доступ по умолчанию — all', () => {
    const record = buildMaterialCreateRecord(
      { ...BASE, tags: ['  Старшая ', 'старшая', 'разминка  группа'] },
      AUTHOR_ID,
      NOW,
    );

    expect(record.title).not.toBe(BASE.title);
    expect(decryptRecord(record, MATERIAL_ENCRYPT_SCHEMA).title).toBe(BASE.title);
    expect(record.tags).toEqual(['Старшая', 'разминка группа']);
    expect(record.access).toBe('all');
    expect(record).not.toHaveProperty('url');
  });
});
