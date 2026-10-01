// Юнит-тест кому уходит «Новый материал» (ADR-0162): набор занятий материала и
// сверка с выбором человека — чистая логика без Mongo (CLAUDE.md «Тесты»).
import type { LessonScope } from '@xuanxue/shared';
import { materialAudienceClassIds, isMaterialInScope } from './material-audience';

const TAICHI = { id: 'c-taichi', tags: ['Новички', 'Утро'] };
const QIGONG = { id: 'c-qigong', tags: ['Цигун'] };
const BARE = { id: 'c-bare', tags: [] };
const ACTIVE = [TAICHI, QIGONG, BARE];

function audience(over: Partial<Parameters<typeof materialAudienceClassIds>[0]> = {}) {
  return materialAudienceClassIds({
    classIds: [],
    lessonClassIds: [],
    tags: [],
    activeClasses: ACTIVE,
    ...over,
  });
}

describe('materialAudienceClassIds', () => {
  it('ни привязок, ни тегов — набор пуст: материал общий', () => {
    expect([...audience()]).toEqual([]);
  });

  it('прямая привязка (classIds) — эти занятия', () => {
    expect([...audience({ classIds: ['c-qigong'] })]).toEqual(['c-qigong']);
  });

  it('привязка к дате занятия (lessonIds) — занятие расписания, к которому дата относится', () => {
    expect([...audience({ lessonClassIds: ['c-taichi'] })]).toEqual(['c-taichi']);
  });

  it('теги совпали с тегами занятия — оно входит в набор', () => {
    expect([...audience({ tags: ['Цигун'] })]).toEqual(['c-qigong']);
  });

  // Тем же сравнением, что у канала (ADR-0108): регистр и пробелы не важны.
  it('теги сравниваются без учёта регистра', () => {
    expect([...audience({ tags: ['НОВИЧКИ'] })]).toEqual(['c-taichi']);
    expect([...audience({ tags: ['цигун'] })]).toEqual(['c-qigong']);
  });

  it('хватает одного общего тега из нескольких', () => {
    expect([...audience({ tags: ['книга', 'утро'] })]).toEqual(['c-taichi']);
  });

  it('тег совпал с несколькими занятиями — все они в наборе', () => {
    const classes = [
      { id: 'a', tags: ['дракон'] },
      { id: 'b', tags: ['Дракон', 'вечер'] },
    ];
    expect([...audience({ tags: ['дракон'], activeClasses: classes })].sort()).toEqual([
      'a',
      'b',
    ]);
  });

  // Выключенное занятие в `activeClasses` не приходит вовсе: тик берёт только
  // активные, поэтому здесь тег ничего не находит и набор остаётся пустым.
  it('тег не совпал ни с одним активным занятием — набор пуст, материал общий', () => {
    expect([...audience({ tags: ['книга'] })]).toEqual([]);
  });

  it('у занятия нет тегов — по тегам материала оно не выбирается', () => {
    expect([...audience({ tags: ['Цигун'], activeClasses: [BARE] })]).toEqual([]);
  });

  it('все три источника объединяются без повторов', () => {
    const result = audience({
      classIds: ['c-taichi'],
      lessonClassIds: ['c-taichi', 'c-x'],
      tags: ['Цигун'],
    });
    expect([...result].sort()).toEqual(['c-qigong', 'c-taichi', 'c-x']);
  });

  // Учитель привязал занятие сам — материал не становится общим оттого, что
  // занятие потом выключили: его в `activeClasses` нет, но привязка остаётся.
  it('привязка к занятию, которого нет среди активных, остаётся в наборе', () => {
    expect([...audience({ classIds: ['c-gone'] })]).toEqual(['c-gone']);
  });

  it('пустые теги не превращаются в «принимает всё» (как у канала без тегов)', () => {
    expect([...audience({ tags: [] })]).toEqual([]);
  });
});

describe('isMaterialInScope', () => {
  const ALL: LessonScope = { mode: 'all', classIds: [] };
  const ONLY_QIGONG: LessonScope = { mode: 'selected', classIds: ['c-qigong'] };
  const NOTHING: LessonScope = { mode: 'selected', classIds: [] };

  it('общий материал приходит всем, в том числе «ни о каких занятиях»', () => {
    for (const scope of [ALL, ONLY_QIGONG, NOTHING]) {
      expect(isMaterialInScope(scope, new Set())).toBe(true);
    }
  });

  it('«Обо всех занятиях» получает материал с занятиями', () => {
    expect(isMaterialInScope(ALL, new Set(['c-taichi']))).toBe(true);
  });

  it('«Только о выбранных» — если выбор касается хотя бы одного занятия материала', () => {
    expect(isMaterialInScope(ONLY_QIGONG, new Set(['c-taichi', 'c-qigong']))).toBe(true);
  });

  it('выбор не пересекается с занятиями материала — не приходит', () => {
    expect(isMaterialInScope(ONLY_QIGONG, new Set(['c-taichi']))).toBe(false);
  });

  it('«Только о выбранных» без галочек не получает материал с занятиями', () => {
    expect(isMaterialInScope(NOTHING, new Set(['c-taichi']))).toBe(false);
  });
});
