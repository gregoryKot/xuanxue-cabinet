// Чистая функция «кому и о каком отменённом занятии написать» (ADR-0162), без
// Mongo и без DI: входят занятие, получатели, их выбор и уже записанные строки.
import type { LessonScope } from '@xuanxue/shared';
import type { LessonPrefs } from '../notifications/lesson-scope.service';
import { planCancelNotices } from './lesson-cancel-notice-plan';
import { lessonRowKey, type PlanLesson } from './lesson-notice-queries';

const ALL: LessonScope = { mode: 'all', classIds: [] };
const STARTS_AT = new Date('2026-09-10T16:00:00Z');

function lesson(id: string, classId = 'c1'): PlanLesson {
  return { id, classId, title: `Занятие ${classId}`, startsAt: STARTS_AT };
}

function prefsOf(entries: Record<string, LessonScope>): Map<string, LessonPrefs> {
  return new Map(Object.entries(entries).map(([id, scope]) => [id, { scope }]));
}

describe('planCancelNotices', () => {
  it('всем получателям обо всех занятиях, со снимком названия и началом занятия', () => {
    const planned = planCancelNotices({
      lessons: [lesson('l1')],
      recipients: [{ id: 'u1' }, { id: 'u2' }],
      prefs: prefsOf({ u1: ALL, u2: ALL }),
      existing: new Set(),
    });

    expect(planned).toEqual([
      {
        userId: 'u1',
        lessonId: 'l1',
        lessonTitle: 'Занятие c1',
        lessonStartsAt: STARTS_AT,
      },
      {
        userId: 'u2',
        lessonId: 'l1',
        lessonTitle: 'Занятие c1',
        lessonStartsAt: STARTS_AT,
      },
    ]);
  });

  it('у получателя нет записи о выборе — «обо всех занятиях»', () => {
    const planned = planCancelNotices({
      lessons: [lesson('l1')],
      recipients: [{ id: 'u1' }],
      prefs: new Map(),
      existing: new Set(),
    });

    expect(planned.map((p) => p.userId)).toEqual(['u1']);
  });

  it('выбрал другое занятие — пропускается; выбрал это — остаётся', () => {
    const planned = planCancelNotices({
      lessons: [lesson('l1', 'c1')],
      recipients: [{ id: 'other' }, { id: 'this' }, { id: 'none' }],
      prefs: prefsOf({
        other: { mode: 'selected', classIds: ['c2'] },
        this: { mode: 'selected', classIds: ['c2', 'c1'] },
        none: { mode: 'selected', classIds: [] },
      }),
      existing: new Set(),
    });

    expect(planned.map((p) => p.userId)).toEqual(['this']);
  });

  it('режим «все» со старыми галочками — остаётся обо всех', () => {
    const planned = planCancelNotices({
      lessons: [lesson('l1', 'c1')],
      recipients: [{ id: 'u1' }],
      prefs: prefsOf({ u1: { mode: 'all', classIds: ['c2'] } }),
      existing: new Set(),
    });

    expect(planned).toHaveLength(1);
  });

  it('строка уже есть — пара пропускается, соседние остаются', () => {
    const planned = planCancelNotices({
      lessons: [lesson('l1'), lesson('l2')],
      recipients: [{ id: 'u1' }, { id: 'u2' }],
      prefs: prefsOf({ u1: ALL, u2: ALL }),
      existing: new Set([lessonRowKey('u1', 'l1')]),
    });

    expect(planned.map((p) => `${p.userId}:${p.lessonId}`)).toEqual([
      'u2:l1',
      'u1:l2',
      'u2:l2',
    ]);
  });

  it('нет занятий или нет получателей — плана нет', () => {
    const base = { prefs: new Map(), existing: new Set<string>() };

    expect(
      planCancelNotices({ ...base, lessons: [], recipients: [{ id: 'u1' }] }),
    ).toEqual([]);
    expect(
      planCancelNotices({ ...base, lessons: [lesson('l1')], recipients: [] }),
    ).toEqual([]);
  });
});
