// Чистая функция «кому и о каком занятии пора» (ADR-0162, п. 3; ADR-0185), без
// Mongo и без DI. Выбор напоминаний решает «о каких», «за сколько минут» — «когда»;
// занятие «разобрано» не для всех сразу, а для пары «человек × занятие».
import { DateTime, Duration } from 'luxon';
import type { LessonScope } from '@xuanxue/shared';
import type { LessonPrefs } from '../notifications/lesson-scope.service';
import { lessonRowKey, type PlanLesson } from './lesson-notice-queries';
import {
  isReminderDue,
  maxLeadMinutes,
  planReminders,
  withReminderChoices,
  ZERO_LEAD_TOLERANCE_SECONDS,
  type ReminderPlanInput,
} from './lesson-reminder-plan';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const ALL: LessonScope = { mode: 'all', classIds: [] };

function lessonIn(id: string, seconds: number, classId = 'c1'): PlanLesson {
  return {
    id,
    classId,
    title: `Занятие ${id}`,
    startsAt: NOW.plus({ seconds }).toJSDate(),
  };
}

function lesson(id: string, minutesFromNow: number, classId = 'c1'): PlanLesson {
  return lessonIn(id, minutesFromNow * 60, classId);
}

interface Choice {
  classes?: string[];
  lessons?: string[];
  minutes?: number;
  scope?: LessonScope;
}

/** Выбор человека: по умолчанию — напоминать о классе `c1`, «как в школе». */
function chose({ classes = ['c1'], lessons = [], minutes, scope = ALL }: Choice = {}) {
  const prefs: LessonPrefs = {
    scope,
    reminderClassIds: new Set(classes),
    reminderLessonIds: new Set(lessons),
  };
  if (minutes !== undefined) prefs.reminderMinutes = minutes;
  return prefs;
}

function plan(
  overrides: Partial<ReminderPlanInput> & Pick<ReminderPlanInput, 'lessons'>,
) {
  return planReminders({
    recipients: [{ id: 'u1' }],
    prefs: new Map([['u1', chose()]]),
    existing: new Set<string>(),
    schoolMinutes: 60,
    now: NOW,
    ...overrides,
  });
}

function prefsOf(entries: Record<string, number | undefined>) {
  return new Map<string, LessonPrefs>(
    Object.entries(entries).map(([id, minutes]) => [id, chose({ minutes })]),
  );
}

describe('planReminders', () => {
  describe('о каких занятиях напоминать (ADR-0185)', () => {
    it('выбрал класс — напоминает о занятии этого класса, о чужом классе нет', () => {
      const result = plan({
        lessons: [lesson('mine', 30, 'c1'), lesson('other', 30, 'c2')],
      });

      expect(result.map((r) => r.lessonId)).toEqual(['mine']);
    });

    it('выбрал отдельное занятие — напоминает о нём, о другом занятии того же класса нет', () => {
      const prefs = new Map([['u1', chose({ classes: [], lessons: ['l1'] })]]);

      const result = plan({ lessons: [lesson('l1', 30), lesson('l2', 30)], prefs });

      expect(result.map((r) => r.lessonId)).toEqual(['l1']);
    });

    it('объединение: класс и отдельное занятие другого класса — оба, а занятие, выбранное дважды, одно', () => {
      const prefs = new Map([['u1', chose({ classes: ['c1'], lessons: ['l1', 'x'] })]]);

      const result = plan({
        lessons: [lesson('l1', 30, 'c1'), lesson('x', 30, 'c2'), lesson('y', 30, 'c3')],
        prefs,
      });

      expect(result.map((r) => r.lessonId)).toEqual(['l1', 'x']);
    });

    it('ни класса, ни занятия — ничего, даже если вид включён', () => {
      const prefs = new Map([['u1', chose({ classes: [], lessons: [] })]]);

      expect(plan({ lessons: [lesson('l1', 30)], prefs })).toEqual([]);
    });

    it('нет записи выбора — ничего: «обо всех» больше не умолчание', () => {
      expect(plan({ lessons: [lesson('l1', 30)], prefs: new Map() })).toEqual([]);
    });

    it('старый режим «все» без выбора напоминаний — ничего', () => {
      const prefs = new Map([['u1', chose({ classes: [], scope: ALL })]]);

      expect(plan({ lessons: [lesson('l1', 30)], prefs })).toEqual([]);
    });

    it('старые «выбранные» не используются: класс из них не даёт напоминания, а его отсутствие не отнимает', () => {
      const prefs = new Map([
        [
          'u1',
          chose({
            classes: ['c1'],
            scope: { mode: 'selected', classIds: ['c2'] },
          }),
        ],
        [
          'u2',
          chose({
            classes: [],
            scope: { mode: 'selected', classIds: ['c1'] },
          }),
        ],
      ]);

      const result = plan({
        lessons: [lesson('l1', 30, 'c1')],
        recipients: [{ id: 'u1' }, { id: 'u2' }],
        prefs,
      });

      expect(result.map((r) => r.userId)).toEqual(['u1']);
    });

    it('выбор одного человека не даёт напоминания другому', () => {
      const prefs = new Map([
        ['picked', chose({ classes: ['c1'] })],
        ['other', chose({ classes: ['c2'] })],
      ]);

      const result = plan({
        lessons: [lesson('l1', 30, 'c1')],
        recipients: [{ id: 'picked' }, { id: 'other' }],
        prefs,
      });

      expect(result.map((r) => r.userId)).toEqual(['picked']);
    });
  });

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

    it('не выбравший «за сколько» берёт школьное значение: при 45 минутах школы пора за 45, не за 60', () => {
      const result = plan({
        lessons: [lesson('l1', 50), lesson('l2', 45)],
        recipients: [{ id: 'plain' }],
        prefs: prefsOf({ plain: undefined }),
        schoolMinutes: 45,
      });

      expect(result).toEqual([
        { lessonId: 'l2', lessonTitle: 'Занятие l2', userId: 'plain' },
      ]);
    });

    it('своё 120 важнее школьного 30, а школьное 45 не сдвигает личное 120', () => {
      const result = plan({
        lessons: [lesson('l1', 90)],
        recipients,
        prefs,
        schoolMinutes: 30,
      });

      expect(result.map((r) => r.userId)).toEqual(['early']);
    });

    it('своё «за сколько» — ноль: школьное не подставляется, о занятии за час не напоминает', () => {
      const result = plan({
        lessons: [lesson('l1', 30)],
        prefs: prefsOf({ u1: 0 }),
        schoolMinutes: 60,
      });

      expect(result).toEqual([]);
    });
  });

  describe('границы окна: положительное «за сколько»', () => {
    it('ровно за `lead` минут — уже пора (включительно)', () => {
      expect(plan({ lessons: [lesson('l1', 60)] })).toHaveLength(1);
    });

    it('на минуту дальше `lead` — рано', () => {
      expect(plan({ lessons: [lesson('l1', 61)] })).toEqual([]);
    });

    it('занятие начинается ровно сейчас — не напоминаем (исключительно)', () => {
      expect(plan({ lessons: [lesson('l1', 0)] })).toEqual([]);
    });

    it('занятие уже началось — не напоминаем, и допуск нулевого «за сколько» тут ни при чём', () => {
      expect(plan({ lessons: [lessonIn('l1', -30)] })).toEqual([]);
    });

    it('доли минуты считаются: за 60 минут и секунду — ещё рано', () => {
      expect(plan({ lessons: [lessonIn('l1', 3601)] })).toEqual([]);
    });
  });

  // ADR-0185: ноль — напомнить в момент начала, на первом тике из
  // [startsAt, startsAt + 60 секунд]; до начала и позже допуска — никогда.
  describe('границы окна: нулевое «за сколько»', () => {
    const zero = new Map([['u1', chose({ minutes: 0 })]]);

    function zeroPlan(secondsFromNow: number) {
      return plan({ lessons: [lessonIn('l1', secondsFromNow)], prefs: zero });
    }

    it('за секунду до начала — рано', () => {
      expect(zeroPlan(1)).toEqual([]);
    });

    it('ровно в начало — пора', () => {
      expect(zeroPlan(0)).toHaveLength(1);
    });

    it('через секунду после начала — пора', () => {
      expect(zeroPlan(-1)).toHaveLength(1);
    });

    it('ровно через 60 секунд после начала — ещё пора (включительно)', () => {
      expect(zeroPlan(-ZERO_LEAD_TOLERANCE_SECONDS)).toHaveLength(1);
    });

    it('через 61 секунду после начала — поздно, пропущенное окно не догоняется', () => {
      expect(zeroPlan(-ZERO_LEAD_TOLERANCE_SECONDS - 1)).toEqual([]);
    });

    it('за минуту до начала — рано: ноль не сдвигает напоминание раньше начала', () => {
      expect(zeroPlan(60)).toEqual([]);
    });

    it('ноль одного человека не двигает положительное «за сколько» другого', () => {
      const prefs = new Map([
        ['zero', chose({ minutes: 0 })],
        ['sixty', chose({ minutes: 60 })],
      ]);

      const result = plan({
        lessons: [lessonIn('l1', 1800)],
        recipients: [{ id: 'zero' }, { id: 'sixty' }],
        prefs,
      });

      expect(result.map((r) => r.userId)).toEqual(['sixty']);
    });
  });

  describe('уже напомнили', () => {
    const recipients = [{ id: 'u1' }, { id: 'u2' }];
    const prefs = new Map([
      ['u1', chose()],
      ['u2', chose()],
    ]);

    it('пара с готовой строкой пропускается, соседняя пара — нет', () => {
      const existing = new Set([lessonRowKey('u1', 'l1')]);

      const result = plan({
        lessons: [lesson('l1', 30), lesson('l2', 30)],
        recipients,
        prefs,
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

    // Занятие сразу после перехода: ровно `lead` настоящих минут до начала, а не
    // стенных. Спринг: 03:10 IDT = 00:10Z; «за 30» — 23:40Z (на стене 01:40 IST,
    // а до стенных 03:10 — 90 минут). Осень: 01:10 IST (второй проход) = 23:10Z;
    // «за 60» — 22:10Z (на стене 01:10 IDT, до стенных 01:10 — ноль минут).
    describe.each([
      {
        name: 'весенний прыжок',
        startsAtUtc: '2026-03-27T00:10:00Z',
        lead: 30,
        dueUtc: '2026-03-26T23:40:00Z',
      },
      {
        name: 'осенний возврат',
        startsAtUtc: '2026-10-24T23:10:00Z',
        lead: 60,
        dueUtc: '2026-10-24T22:10:00Z',
      },
      {
        name: 'весенний прыжок, ноль',
        startsAtUtc: '2026-03-27T00:10:00Z',
        lead: 0,
        dueUtc: '2026-03-27T00:10:00Z',
      },
      {
        name: 'осенний возврат, ноль',
        startsAtUtc: '2026-10-24T23:10:00Z',
        lead: 0,
        dueUtc: '2026-10-24T23:10:00Z',
      },
    ])('занятие сразу после перехода — $name', ({ startsAtUtc, lead, dueUtc }) => {
      const startsAt = new Date(startsAtUtc);
      const dueAt = DateTime.fromISO(dueUtc, { zone: 'utc' });
      const lessons = [{ id: 'l1', classId: 'c1', title: 'Ночное', startsAt }];
      const leadPrefs = new Map([['u1', chose({ minutes: lead })]]);
      const at = (now: DateTime) =>
        plan({ lessons, prefs: leadPrefs, now: now.setZone('Asia/Jerusalem') });

      it('ровно за `lead` настоящих минут — пора', () => {
        expect(at(dueAt)).toHaveLength(1);
      });

      it('на секунду раньше — ещё рано', () => {
        expect(at(dueAt.minus({ seconds: 1 }))).toEqual([]);
      });
    });
  });
});

describe('isReminderDue', () => {
  const until = (seconds: number) => Duration.fromObject({ seconds });

  it('положительное «за сколько»: (0, lead] минут до начала', () => {
    expect(isReminderDue(until(1), 15)).toBe(true);
    expect(isReminderDue(until(15 * 60), 15)).toBe(true);
    expect(isReminderDue(until(15 * 60 + 1), 15)).toBe(false);
    expect(isReminderDue(until(0), 15)).toBe(false);
    expect(isReminderDue(until(-1), 15)).toBe(false);
  });

  it('ноль: [начало, начало + допуск], до начала и позже допуска — нет', () => {
    expect(isReminderDue(until(1), 0)).toBe(false);
    expect(isReminderDue(until(0), 0)).toBe(true);
    expect(isReminderDue(until(-ZERO_LEAD_TOLERANCE_SECONDS), 0)).toBe(true);
    expect(isReminderDue(until(-ZERO_LEAD_TOLERANCE_SECONDS - 1), 0)).toBe(false);
  });

  it('допуск нуля — одна минута, как у тика планировщика', () => {
    expect(ZERO_LEAD_TOLERANCE_SECONDS).toBe(60);
  });
});

describe('withReminderChoices', () => {
  it('оставляет только тех, у кого есть класс или занятие; без записи — выпадает', () => {
    const prefs = new Map<string, LessonPrefs>([
      ['byClass', chose({ classes: ['c1'] })],
      ['byLesson', chose({ classes: [], lessons: ['l1'] })],
      ['empty', chose({ classes: [] })],
    ]);

    const result = withReminderChoices(
      [{ id: 'byClass' }, { id: 'byLesson' }, { id: 'empty' }, { id: 'noDoc' }],
      prefs,
    );

    expect(result.map((r) => r.id)).toEqual(['byClass', 'byLesson']);
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

  it('все выбрали ноль — окно нулевое, школьное в него не попадает', () => {
    expect(maxLeadMinutes([{ id: 'a' }], prefsOf({ a: 0 }), 60)).toBe(0);
  });

  it('получателей нет — ноль, окно пустое', () => {
    expect(maxLeadMinutes([], new Map(), 60)).toBe(0);
  });
});
