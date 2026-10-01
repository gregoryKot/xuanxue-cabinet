// Чистая функция «кому и о каком занятии пора» (ADR-0162, п. 3), без Mongo и
// без DI. «За сколько минут» у каждого своё; занятие «разобрано» не для всех
// сразу, а для пары «человек × занятие».
import { DateTime } from 'luxon';
import type { LessonScope } from '@xuanxue/shared';
import type { LessonPrefs } from '../notifications/lesson-scope.service';
import { lessonRowKey, type PlanLesson } from './lesson-notice-queries';
import {
  maxLeadMinutes,
  planReminders,
  type ReminderPlanInput,
} from './lesson-reminder-plan';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const ALL: LessonScope = { mode: 'all', classIds: [] };

function lesson(id: string, minutesFromNow: number, classId = 'c1'): PlanLesson {
  return {
    id,
    classId,
    title: `Занятие ${id}`,
    startsAt: NOW.plus({ minutes: minutesFromNow }).toJSDate(),
  };
}

function plan(
  overrides: Partial<ReminderPlanInput> & Pick<ReminderPlanInput, 'lessons'>,
) {
  return planReminders({
    recipients: [{ id: 'u1' }],
    prefs: new Map<string, LessonPrefs>(),
    existing: new Set<string>(),
    schoolMinutes: 60,
    now: NOW,
    ...overrides,
  });
}

function prefsOf(entries: Record<string, number | undefined>) {
  return new Map<string, LessonPrefs>(
    Object.entries(entries).map(([id, reminderMinutes]) => [
      id,
      reminderMinutes === undefined ? { scope: ALL } : { scope: ALL, reminderMinutes },
    ]),
  );
}

describe('planReminders', () => {
  describe('у каждого своё «за сколько»', () => {
    const recipients = [{ id: 'early' }, { id: 'late' }];
    const prefs = prefsOf({ early: 120, late: 15 });

    it('за 60 минут пора только тому, кто выбрал 120', () => {
      const result = plan({ lessons: [lesson('l1', 60)], recipients, prefs });

      expect(result.map((r) => r.userId)).toEqual(['early']);
    });

    it('за 10 минут пора обоим', () => {
      const result = plan({ lessons: [lesson('l1', 10)], recipients, prefs });

      expect(result.map((r) => r.userId)).toEqual(['early', 'late']);
    });

    it('не выбравший берёт школьное значение: при 45 минутах школы пора за 45, не за 60', () => {
      const result = plan({
        lessons: [lesson('l1', 50), lesson('l2', 45)],
        recipients: [{ id: 'plain' }],
        schoolMinutes: 45,
      });

      expect(result).toEqual([
        { lessonId: 'l2', lessonTitle: 'Занятие l2', userId: 'plain' },
      ]);
    });

    it('свой выбор важнее школьного и в большую, и в меньшую сторону', () => {
      const result = plan({
        lessons: [lesson('l1', 90)],
        recipients,
        prefs,
        schoolMinutes: 30,
      });

      expect(result.map((r) => r.userId)).toEqual(['early']);
    });
  });

  describe('границы окна', () => {
    it('ровно за `lead` минут — уже пора (включительно)', () => {
      expect(plan({ lessons: [lesson('l1', 60)] })).toHaveLength(1);
    });

    it('на минуту дальше `lead` — рано', () => {
      expect(plan({ lessons: [lesson('l1', 61)] })).toEqual([]);
    });

    it('занятие начинается ровно сейчас — не напоминаем (исключительно)', () => {
      expect(plan({ lessons: [lesson('l1', 0)] })).toEqual([]);
    });

    it('занятие уже началось — не напоминаем', () => {
      expect(plan({ lessons: [lesson('l1', -5)] })).toEqual([]);
    });

    it('доли минуты считаются: за 60 минут и секунду — ещё рано', () => {
      const late: PlanLesson = {
        ...lesson('l1', 60),
        startsAt: NOW.plus({ minutes: 60, seconds: 1 }).toJSDate(),
      };

      expect(plan({ lessons: [late] })).toEqual([]);
    });
  });

  describe('о каких занятиях', () => {
    it('«выбранные» без этого занятия — пропуск, «все» и «выбранные с ним» — пора', () => {
      const prefs = new Map<string, LessonPrefs>([
        ['all', { scope: ALL }],
        ['has', { scope: { mode: 'selected', classIds: ['c1'] } }],
        ['other', { scope: { mode: 'selected', classIds: ['c2'] } }],
        ['none', { scope: { mode: 'selected', classIds: [] } }],
      ]);

      const result = plan({
        lessons: [lesson('l1', 30)],
        recipients: [{ id: 'all' }, { id: 'has' }, { id: 'other' }, { id: 'none' }],
        prefs,
      });

      expect(result.map((r) => r.userId)).toEqual(['all', 'has']);
    });

    it('у человека нет записи выбора — обо всех занятиях, как до ADR-0162', () => {
      expect(plan({ lessons: [lesson('l1', 30, 'any')] })).toHaveLength(1);
    });
  });

  describe('уже напомнили', () => {
    it('пара с готовой строкой пропускается, соседняя пара — нет', () => {
      const existing = new Set([lessonRowKey('u1', 'l1')]);

      const result = plan({
        lessons: [lesson('l1', 30), lesson('l2', 30)],
        recipients: [{ id: 'u1' }, { id: 'u2' }],
        existing,
      });

      expect(result.map((r) => `${r.userId}:${r.lessonId}`)).toEqual([
        'u2:l1',
        'u1:l2',
        'u2:l2',
      ]);
    });

    it('сменил 15 → 120 после напоминания: вторая строка не планируется', () => {
      const existing = new Set([lessonRowKey('u1', 'l1')]);

      const result = plan({
        lessons: [lesson('l1', 10)],
        prefs: prefsOf({ u1: 120 }),
        existing,
      });

      expect(result).toEqual([]);
    });

    it('строка другого человека о том же занятии не мешает', () => {
      const existing = new Set([lessonRowKey('u2', 'l1')]);

      expect(plan({ lessons: [lesson('l1', 30)], existing })).toHaveLength(1);
    });
  });

  it('в плане есть название занятия — оно уходит снимком в строку ленты', () => {
    expect(plan({ lessons: [lesson('l1', 30)] })).toEqual([
      { lessonId: 'l1', lessonTitle: 'Занятие l1', userId: 'u1' },
    ]);
  });

  it('нет занятий или нет получателей — пустой план', () => {
    expect(plan({ lessons: [] })).toEqual([]);
    expect(plan({ lessons: [lesson('l1', 30)], recipients: [] })).toEqual([]);
  });

  // ADR-0162, CLAUDE.md «Время»: переход Asia/Jerusalem. Ночью на 2026-03-27
  // в 02:00 IST часы прыгают на 03:00 IDT, ночью на 2026-10-25 в 02:00 IDT
  // возвращаются на 01:00 IST. «Часы на стене» врут на час, разница моментов
  // — нет.
  describe('переход на летнее время Asia/Jerusalem', () => {
    const recipients = [{ id: 'sixty' }, { id: 'thirty' }];
    const prefs = prefsOf({ sixty: 60, thirty: 30 });

    it('весенний прыжок: на стене 01:30 → 03:30 — это 60 минут, а не 120', () => {
      const now = DateTime.fromISO('2026-03-27T01:30:00', { zone: 'Asia/Jerusalem' });
      const startsAt = DateTime.fromISO('2026-03-27T03:30:00', {
        zone: 'Asia/Jerusalem',
      }).toJSDate();

      const result = plan({
        lessons: [{ id: 'l1', classId: 'c1', title: 'Ночное', startsAt }],
        recipients,
        prefs,
        now,
      });

      expect(result.map((r) => r.userId)).toEqual(['sixty']);
    });

    it('осенний возврат: на стене 00:30 → 01:30 — это 120 минут, а не 60', () => {
      // 00:30 IDT = 21:30Z; 01:30 IST (вторая «01:30» ночи) = 23:30Z.
      const now = DateTime.fromISO('2026-10-24T21:30:00Z', { zone: 'utc' }).setZone(
        'Asia/Jerusalem',
      );
      const startsAt = new Date('2026-10-24T23:30:00Z');

      const at120 = plan({
        lessons: [{ id: 'l1', classId: 'c1', title: 'Ночное', startsAt }],
        recipients: [{ id: 'sixty' }, { id: 'long' }],
        prefs: prefsOf({ sixty: 60, long: 120 }),
        now,
      });

      expect(at120.map((r) => r.userId)).toEqual(['long']);
    });

    it('пояс `now` не важен: те же моменты в UTC дают тот же план', () => {
      const startsAt = new Date('2026-03-27T00:30:00Z');
      const inUtc = DateTime.fromISO('2026-03-26T23:30:00Z', { zone: 'utc' });
      const inJerusalem = inUtc.setZone('Asia/Jerusalem');
      const lessons = [{ id: 'l1', classId: 'c1', title: 'Ночное', startsAt }];

      expect(plan({ lessons, recipients, prefs, now: inJerusalem })).toEqual(
        plan({ lessons, recipients, prefs, now: inUtc }),
      );
    });
  });
});

describe('maxLeadMinutes', () => {
  it('самое раннее из значений: выбор человека или школьное', () => {
    const prefs = prefsOf({ a: 15, b: 120 });

    expect(maxLeadMinutes([{ id: 'a' }, { id: 'b' }], prefs, 60)).toBe(120);
    expect(maxLeadMinutes([{ id: 'a' }, { id: 'c' }], prefs, 60)).toBe(60);
    expect(maxLeadMinutes([{ id: 'a' }], prefs, 60)).toBe(15);
  });

  it('у всех школьное — окно школьное', () => {
    expect(maxLeadMinutes([{ id: 'x' }, { id: 'y' }], new Map(), 45)).toBe(45);
  });

  it('получателей нет — ноль, окно пустое', () => {
    expect(maxLeadMinutes([], new Map(), 60)).toBe(0);
  });
});
