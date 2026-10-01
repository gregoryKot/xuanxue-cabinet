// Юнит-тест planMaterialNotices — чистая логика без Mongo (CLAUDE.md «Тесты»):
// кому из получателей и о каком материале писать, учитывая выбор «о каких
// занятиях» и строки, которые уже есть (ADR-0162).
import type { LessonPrefs } from '../notifications/lesson-scope.service';
import { lessonRowKey } from '../lessons/lesson-notice-queries';
import type { PlanMaterial } from './material-new-notice-queries';
import { planMaterialNotices } from './material-new-notice-plan';

const GENERAL: PlanMaterial = { id: 'm-general', title: 'Общая', audience: new Set() };
const QIGONG: PlanMaterial = {
  id: 'm-qigong',
  title: 'Про цигун',
  audience: new Set(['c-qigong']),
};

const ALL: LessonPrefs = { scope: { mode: 'all', classIds: [] } };
const ONLY_TAICHI: LessonPrefs = { scope: { mode: 'selected', classIds: ['c-taichi'] } };
const ONLY_QIGONG: LessonPrefs = { scope: { mode: 'selected', classIds: ['c-qigong'] } };

function plan(input: Partial<Parameters<typeof planMaterialNotices>[0]> = {}) {
  return planMaterialNotices({
    materials: [GENERAL, QIGONG],
    recipients: [{ id: 'u1' }],
    prefs: new Map([['u1', ALL]]),
    existing: new Set(),
    ...input,
  });
}

describe('planMaterialNotices', () => {
  it('«обо всех занятиях» — оба материала, с id и названием', () => {
    expect(plan()).toEqual([
      { userId: 'u1', materialId: 'm-general', materialTitle: 'Общая' },
      { userId: 'u1', materialId: 'm-qigong', materialTitle: 'Про цигун' },
    ]);
  });

  it('выбрал другое занятие — получает только общий материал', () => {
    const planned = plan({ prefs: new Map([['u1', ONLY_TAICHI]]) });

    expect(planned.map((p) => p.materialId)).toEqual(['m-general']);
  });

  it('выбрал занятие материала — получает оба', () => {
    const planned = plan({ prefs: new Map([['u1', ONLY_QIGONG]]) });

    expect(planned.map((p) => p.materialId)).toEqual(['m-general', 'm-qigong']);
  });

  it('у человека нет записи о выборе — «обо всех занятиях»', () => {
    expect(plan({ prefs: new Map() })).toHaveLength(2);
  });

  it('пара, по которой строка уже есть, пропускается; остальные остаются', () => {
    const planned = plan({ existing: new Set([lessonRowKey('u1', 'm-general')]) });

    expect(planned.map((p) => p.materialId)).toEqual(['m-qigong']);
  });

  it('строка другого человека того же материала чужую пару не закрывает', () => {
    const planned = plan({
      recipients: [{ id: 'u1' }, { id: 'u2' }],
      prefs: new Map([
        ['u1', ALL],
        ['u2', ALL],
      ]),
      existing: new Set([lessonRowKey('u1', 'm-general')]),
    });

    expect(planned.filter((p) => p.materialId === 'm-general')).toEqual([
      { userId: 'u2', materialId: 'm-general', materialTitle: 'Общая' },
    ]);
  });

  it('нет получателей или материалов — плана нет', () => {
    expect(plan({ recipients: [] })).toEqual([]);
    expect(plan({ materials: [] })).toEqual([]);
  });
});
