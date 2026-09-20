// Юнит-тест buildMaterialsFilter — чистая логика без Mongo и без DI
// (CLAUDE.md «Тесты»): все ветки фильтра GET /materials, включая сочетание
// classId и lessonId «И» (ADR-0056). detachMaterialReference — против
// настоящей Mongo, покрыт read-after-write в materials.service.spec.ts,
// lessons.service.spec.ts и classes.service.spec.ts (нужен реальный $pull).
import { Types } from 'mongoose';
import { buildMaterialsFilter } from './materials.queries';

describe('buildMaterialsFilter', () => {
  it('без фильтров — пустой объект', () => {
    expect(buildMaterialsFilter({})).toEqual({});
  });

  it('classId валидный — попадает в фильтр', () => {
    const classId = new Types.ObjectId().toString();
    expect(buildMaterialsFilter({ classId })).toEqual({ classIds: classId });
  });

  it('classId кривой — null, не ошибка', () => {
    expect(buildMaterialsFilter({ classId: 'не-id' })).toBeNull();
  });

  it('lessonId валидный — попадает в фильтр', () => {
    const lessonId = new Types.ObjectId().toString();
    expect(buildMaterialsFilter({ lessonId })).toEqual({ lessonIds: lessonId });
  });

  it('lessonId кривой — null, не ошибка', () => {
    expect(buildMaterialsFilter({ lessonId: 'не-id' })).toBeNull();
  });

  it('classId и lessonId вместе — оба в фильтре («И», не «ИЛИ»)', () => {
    const classId = new Types.ObjectId().toString();
    const lessonId = new Types.ObjectId().toString();
    expect(buildMaterialsFilter({ classId, lessonId })).toEqual({
      classIds: classId,
      lessonIds: lessonId,
    });
  });

  it('kind — попадает в фильтр рядом с остальными', () => {
    const classId = new Types.ObjectId().toString();
    expect(buildMaterialsFilter({ classId, kind: 'video' })).toEqual({
      classIds: classId,
      kind: 'video',
    });
  });
});
