// Разбор снимка настроек напоминаний (reminderSnapshot.ts, контракт reminder-sync,
// версия 1): что считается снимком. Чистая логика — ни сети, ни DOM. Контрпримеры
// ниже — те, что Workshop прогнал против прежнего разбора, и он их принимал.
import { describe, expect, it } from 'vitest';
import type { LessonScopeClassDto } from '@xuanxue/shared';
import {
  EVENING,
  EVENING_ID,
  LESSON_ID,
  MORNING,
  MORNING_ID,
  makeClass,
  makeSnapshot,
} from '../test-support/reminderSyncFixtures';
import { parseReminderSnapshot } from './reminderSnapshot';

const VALID_SLOT = { weekday: 1, time: '10:00', durationMin: 60 };

function withSlot(slot: unknown): unknown {
  return makeSnapshot({
    classes: [{ ...MORNING, slots: [slot] } as LessonScopeClassDto],
  });
}

function withClass(overrides: Record<string, unknown>): unknown {
  return makeSnapshot({ classes: [{ ...MORNING, ...overrides }] });
}

function parsedSlots(body: unknown): unknown {
  return parseReminderSnapshot(body)?.classes[0]?.slots;
}

describe('parseReminderSnapshot — что считается снимком', () => {
  it('полный снимок разбирается, лишние поля верхнего уровня отбрасываются', () => {
    const body = {
      ...makeSnapshot({ revision: '12', lessonIds: [LESSON_ID] }),
      extra: 1,
    };

    expect(parseReminderSnapshot(body)).toEqual(
      makeSnapshot({ revision: '12', lessonIds: [LESSON_ID] }),
    );
  });

  it('пустой выбор, нулевая ревизия и пустой каталог — снимок, а не ошибка', () => {
    const empty = makeSnapshot({
      revision: '0',
      classIds: [],
      lessonIds: [],
      classes: [],
    });

    expect(parseReminderSnapshot(empty)).toEqual(empty);
  });

  it.each([0, 15, 30, 60, 120, null])(
    'своё время %s из списка принимается',
    (minutes) => {
      expect(
        parseReminderSnapshot(makeSnapshot({ leadMinutes: minutes })),
      ).not.toBeNull();
    },
  );

  it.each([5, 1440])('школьное время %i на границе принимается', (minutes) => {
    expect(
      parseReminderSnapshot(makeSnapshot({ schoolMinutes: minutes })),
    ).not.toBeNull();
  });

  it.each([0, 6])('день недели %i на границе принимается', (weekday) => {
    expect(parseReminderSnapshot(withSlot({ ...VALID_SLOT, weekday }))).not.toBeNull();
  });

  it.each(['00:00', '23:59'])('время начала %s на границе принимается', (time) => {
    expect(parseReminderSnapshot(withSlot({ ...VALID_SLOT, time }))).not.toBeNull();
  });

  it.each([1, 2])('everyWeeks %i принимается и сохраняется', (everyWeeks) => {
    const slot = { ...VALID_SLOT, everyWeeks };

    expect(parsedSlots(withSlot(slot))).toEqual([slot]);
  });

  it('everyWeeks можно не присылать — слот остаётся без него', () => {
    expect(parsedSlots(withSlot(VALID_SLOT))).toEqual([VALID_SLOT]);
  });

  it('пустая подпись группы принимается', () => {
    expect(parseReminderSnapshot(withClass({ groupLabel: '' }))).not.toBeNull();
  });

  it('класс без слотов — снимок: расписание могут ещё не заполнить', () => {
    expect(parseReminderSnapshot(withClass({ slots: [] }))).not.toBeNull();
  });

  it.each(['Asia/Jerusalem', 'UTC', 'Australia/Sydney'])('пояс %s принимается', (tz) => {
    expect(parseReminderSnapshot(withClass({ tz }))).not.toBeNull();
  });

  it('несколько классов по возрастанию id и выбор из них — снимок', () => {
    const body = makeSnapshot({
      classIds: [MORNING_ID, EVENING_ID],
      classes: [MORNING, EVENING],
    });

    expect(parseReminderSnapshot(body)).toEqual(body);
  });
});

describe('parseReminderSnapshot — общая форма', () => {
  it.each([
    ['не объект', 'снимок'],
    ['null', null],
    ['массив', []],
    ['версия 2', { ...makeSnapshot(), version: 2 }],
    ['версия строкой', { ...makeSnapshot(), version: '1' }],
    ['без версии', { ...makeSnapshot(), version: undefined }],
    ['accountId числом', { ...makeSnapshot(), accountId: 1 }],
    ['пустой accountId', makeSnapshot({ accountId: '' })],
    ['ревизия числом', { ...makeSnapshot(), revision: 5 }],
    ['ревизия с ведущим нулём', makeSnapshot({ revision: '05' })],
    ['отрицательная ревизия', makeSnapshot({ revision: '-1' })],
    ['дробная ревизия', makeSnapshot({ revision: '1.5' })],
    ['пустая ревизия', makeSnapshot({ revision: '' })],
    ['время вне списка', makeSnapshot({ leadMinutes: 45 })],
    ['время дробью', { ...makeSnapshot(), leadMinutes: 1.5 }],
    ['время строкой', { ...makeSnapshot(), leadMinutes: '15' }],
    ['без времени', { ...makeSnapshot(), leadMinutes: undefined }],
    ['каталог не массив', { ...makeSnapshot(), classes: {} }],
  ])('%s — не снимок', (_name, body) => {
    expect(parseReminderSnapshot(body)).toBeNull();
  });
});

describe('parseReminderSnapshot — выбранные id', () => {
  it.each([
    ['classIds не массив', { ...makeSnapshot(), classIds: MORNING_ID }],
    ['classIds с повтором', makeSnapshot({ classIds: [MORNING_ID, MORNING_ID] })],
    ['classIds не по возрастанию', makeSnapshot({ classIds: [EVENING_ID, MORNING_ID] })],
    ['classIds с числом', { ...makeSnapshot(), classIds: [1] }],
    ['classIds: не ObjectId', makeSnapshot({ classIds: ['class-1'] })],
    ['classIds: заглавный hex', makeSnapshot({ classIds: [MORNING_ID.toUpperCase()] })],
    ['classIds: 23 символа', makeSnapshot({ classIds: [MORNING_ID.slice(1)] })],
    ['classIds: 25 символов', makeSnapshot({ classIds: [`${MORNING_ID}0`] })],
    ['lessonIds с числом', { ...makeSnapshot(), lessonIds: [1] }],
    ['lessonIds не по возрастанию', makeSnapshot({ lessonIds: [LESSON_ID, MORNING_ID] })],
    ['lessonIds: не ObjectId', makeSnapshot({ lessonIds: ['class-1'] })],
    ['lessonIds: заглавный hex', makeSnapshot({ lessonIds: [LESSON_ID.toUpperCase()] })],
    ['lessonIds: не hex', makeSnapshot({ lessonIds: ['z'.repeat(24)] })],
  ])('%s — не снимок', (_name, body) => {
    expect(parseReminderSnapshot(body)).toBeNull();
  });
});

describe('parseReminderSnapshot — школьное время', () => {
  it.each([
    ['1 — ниже границы (контрпример Workshop)', 1],
    ['4 — на единицу ниже границы', 4],
    ['1441 — выше границы (контрпример Workshop)', 1441],
    ['0', 0],
    ['−5', -5],
    ['дробью', 60.5],
    ['строкой', '60'],
    ['null', null],
  ])('%s — не снимок', (_name, schoolMinutes) => {
    expect(parseReminderSnapshot({ ...makeSnapshot(), schoolMinutes })).toBeNull();
  });
});

describe('parseReminderSnapshot — каталог занятий', () => {
  it.each([
    ['без расписания', { id: MORNING_ID, title: 'а', groupLabel: '', tz: 'UTC' }],
    ['id не ObjectId (контрпример Workshop)', { ...MORNING, id: 'class-1' }],
    ['id заглавным hex', { ...MORNING, id: MORNING_ID.toUpperCase() }],
    ['пояс не из базы IANA', { ...MORNING, tz: 'Mars/Olympus' }],
    ['пустой пояс', { ...MORNING, tz: '' }],
    ['пояс не строкой', { ...MORNING, tz: 3 }],
    ['название не строкой', { ...MORNING, title: 5 }],
    ['подпись группы не строкой', { ...MORNING, groupLabel: null }],
  ])('класс %s — не снимок', (_name, klass) => {
    expect(parseReminderSnapshot(makeSnapshot({ classes: [klass as never] }))).toBeNull();
  });

  it('повтор id в каталоге — не снимок', () => {
    const body = makeSnapshot({
      classes: [
        makeClass(MORNING_ID, 'а', 1, '09:00'),
        makeClass(MORNING_ID, 'б', 2, '10:00'),
      ],
    });

    expect(parseReminderSnapshot(body)).toBeNull();
  });

  it('каталог не по возрастанию id — не снимок', () => {
    expect(
      parseReminderSnapshot(makeSnapshot({ classes: [EVENING, MORNING] })),
    ).toBeNull();
  });
});

describe('parseReminderSnapshot — слоты расписания', () => {
  it('слот из контрпримера Workshop целиком — не снимок', () => {
    const slot = { weekday: 9, time: 'not-a-time', durationMin: -1, everyWeeks: 3 };

    expect(parseReminderSnapshot(withSlot(slot))).toBeNull();
  });

  it.each([
    ['день недели 7', { weekday: 7 }],
    ['день недели −1', { weekday: -1 }],
    ['день недели дробью', { weekday: 1.5 }],
    ['день недели строкой', { weekday: 'пн' }],
    ['без дня недели', { weekday: undefined }],
    ['время «24:00»', { time: '24:00' }],
    ['время «7:00» без ведущего нуля', { time: '7:00' }],
    ['время «10:60»', { time: '10:60' }],
    ['время с секундами', { time: '10:00:00' }],
    ['время «not-a-time»', { time: 'not-a-time' }],
    ['время числом', { time: 1000 }],
    ['длительность 0', { durationMin: 0 }],
    ['длительность −1', { durationMin: -1 }],
    ['длительность дробью', { durationMin: 45.5 }],
    ['длительность строкой', { durationMin: '60' }],
    ['everyWeeks 3', { everyWeeks: 3 }],
    ['everyWeeks 0', { everyWeeks: 0 }],
    ['everyWeeks строкой', { everyWeeks: '2' }],
    ['everyWeeks null', { everyWeeks: null }],
  ])('слот: %s — не снимок', (_name, override) => {
    expect(parseReminderSnapshot(withSlot({ ...VALID_SLOT, ...override }))).toBeNull();
  });

  it('слот не объект — не снимок', () => {
    expect(parseReminderSnapshot(withSlot('пн 10:00'))).toBeNull();
  });

  it('один плохой слот среди хороших портит весь снимок', () => {
    const slots = [VALID_SLOT, { ...VALID_SLOT, weekday: 7 }];

    expect(parseReminderSnapshot(withClass({ slots }))).toBeNull();
  });
});
