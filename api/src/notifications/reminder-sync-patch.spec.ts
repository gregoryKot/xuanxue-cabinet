// Разбор тела записи и переход состояния (ADR-0185): чистая логика, без Mongo и
// без HTTP. Каждый «нельзя» из контракта reminder-sync — отдельная строка.
import { REMINDER_SYNC_MAX_CHANGES, type ReminderChange } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import {
  applyReminderChanges,
  parseReminderPatch,
  type ReminderState,
} from './reminder-sync-patch';

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const C = '0123456789abcdef01234567';

const select = (
  kind: 'class' | 'lesson',
  id: string,
  selected = true,
): ReminderChange => ({
  kind,
  id,
  selected,
});

describe('parseReminderPatch: верные тела', () => {
  it('выбор занятия расписания, отдельного занятия и минут — типизированными изменениями', () => {
    const changes = parseReminderPatch({
      version: 1,
      changes: [
        { kind: 'class', id: A, selected: true },
        { kind: 'lesson', id: B, selected: false },
        { kind: 'lead', minutes: 30 },
      ],
    });

    expect(changes).toEqual([
      { kind: 'class', id: A, selected: true },
      { kind: 'lesson', id: B, selected: false },
      { kind: 'lead', minutes: 30 },
    ]);
  });

  it.each([0, 15, 30, 60, 120, null])('минуты %p принимаются', (minutes) => {
    expect(
      parseReminderPatch({ version: 1, changes: [{ kind: 'lead', minutes }] }),
    ).toEqual([{ kind: 'lead', minutes }]);
  });

  it('-0 ложится обычным нулём', () => {
    const [change] = parseReminderPatch({
      version: 1,
      changes: [{ kind: 'lead', minutes: -0 }],
    });

    expect(Object.is((change as { minutes: number }).minutes, 0)).toBe(true);
  });

  it('один и тот же id у разных видов — разные ключи', () => {
    expect(
      parseReminderPatch({
        version: 1,
        changes: [select('class', A), select('lesson', A)],
      }),
    ).toHaveLength(2);
  });

  it('границы: один ключ и ровно максимум ключей', () => {
    const many = Array.from({ length: REMINDER_SYNC_MAX_CHANGES }, (_, i) =>
      select('lesson', i.toString(16).padStart(24, '0')),
    );

    expect(
      parseReminderPatch({ version: 1, changes: [select('class', C)] }),
    ).toHaveLength(1);
    expect(parseReminderPatch({ version: 1, changes: many })).toHaveLength(64);
  });
});

describe('parseReminderPatch: отказы', () => {
  const ok = select('class', A);

  it.each([
    ['null', null],
    ['массив', []],
    ['строка', 'x'],
    ['число', 1],
    ['пустой объект', {}],
    ['нет version', { changes: [ok] }],
    ['нет changes', { version: 1 }],
    ['лишнее поле сверху', { version: 1, changes: [ok], extra: true }],
    ['version 2', { version: 2, changes: [ok] }],
    ['version строкой', { version: '1', changes: [ok] }],
    ['version null', { version: null, changes: [ok] }],
    ['changes не список', { version: 1, changes: ok }],
    ['changes null', { version: 1, changes: null }],
    ['changes пустой', { version: 1, changes: [] }],
  ])('тело: %s', (_name, body) => {
    expect(() => parseReminderPatch(body)).toThrow(InvalidInputError);
  });

  it('65 изменений — отказ', () => {
    const changes = Array.from({ length: REMINDER_SYNC_MAX_CHANGES + 1 }, (_, i) =>
      select('lesson', i.toString(16).padStart(24, '0')),
    );

    expect(() => parseReminderPatch({ version: 1, changes })).toThrow(InvalidInputError);
  });

  it.each([
    ['не объект: null', null],
    ['не объект: строка', 'class'],
    ['не объект: массив', [A]],
    ['неизвестный kind', { kind: 'group', id: A, selected: true }],
    ['kind не строка', { kind: 1, id: A, selected: true }],
    ['нет kind', { id: A, selected: true }],
    ['kind регистром', { kind: 'Class', id: A, selected: true }],
    ['выбор без id', { kind: 'class', selected: true }],
    ['выбор без selected', { kind: 'class', id: A }],
    ['id null', { kind: 'class', id: null, selected: true }],
    ['selected null', { kind: 'class', id: A, selected: null }],
    ['selected строкой', { kind: 'class', id: A, selected: 'true' }],
    ['selected числом', { kind: 'lesson', id: A, selected: 1 }],
    ['id числом', { kind: 'class', id: 123, selected: true }],
    ['выбор с minutes', { kind: 'class', id: A, selected: true, minutes: 15 }],
    ['лишнее поле у выбора', { kind: 'lesson', id: A, selected: true, extra: 1 }],
    ['lead без minutes', { kind: 'lead' }],
    ['lead с id', { kind: 'lead', minutes: 15, id: A }],
    ['lead с selected', { kind: 'lead', minutes: 15, selected: true }],
    ['lead с лишним полем', { kind: 'lead', minutes: 15, extra: 1 }],
    ['minutes не из списка', { kind: 'lead', minutes: 45 }],
    ['minutes отрицательные', { kind: 'lead', minutes: -15 }],
    ['minutes дробные', { kind: 'lead', minutes: 15.5 }],
    ['minutes строкой', { kind: 'lead', minutes: '15' }],
    ['minutes undefined', { kind: 'lead', minutes: undefined }],
    ['minutes false', { kind: 'lead', minutes: false }],
  ])('изменение: %s', (_name, change) => {
    expect(() => parseReminderPatch({ version: 1, changes: [ok, change] })).toThrow(
      InvalidInputError,
    );
  });

  it.each([
    ['заглавный hex', 'A'.repeat(24)],
    ['смесь регистров', 'aAaAaAaAaAaAaAaAaAaAaAaA'],
    ['23 знака', 'a'.repeat(23)],
    ['25 знаков', 'a'.repeat(25)],
    ['не hex', 'g'.repeat(24)],
    ['пустой', ''],
    ['пробел в конце', `${'a'.repeat(23)} `],
    ['перевод строки в конце', `${'a'.repeat(24)}\n`],
    ['с дефисами', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaa'],
    ['кириллица', 'а'.repeat(24)],
  ])('id: %s', (_name, id) => {
    for (const kind of ['class', 'lesson'] as const) {
      expect(() =>
        parseReminderPatch({ version: 1, changes: [{ kind, id, selected: true }] }),
      ).toThrow(InvalidInputError);
    }
  });

  it.each([
    ['(class, id) дважды с одним значением', [select('class', A), select('class', A)]],
    [
      '(class, id) дважды с разными значениями',
      [select('class', A), select('class', A, false)],
    ],
    ['(lesson, id) дважды', [select('lesson', B, false), select('lesson', B, false)]],
    [
      'lead дважды',
      [
        { kind: 'lead', minutes: 15 },
        { kind: 'lead', minutes: null },
      ],
    ],
    ['повтор не рядом', [select('class', A), select('lesson', A), select('class', A)]],
  ])('повтор ключа: %s', (_name, changes) => {
    expect(() => parseReminderPatch({ version: 1, changes })).toThrow(InvalidInputError);
  });

  it('объект без прототипа (как после строгого разбора) читается так же', () => {
    const change = Object.assign(Object.create(null) as object, {
      kind: 'class',
      id: A,
      selected: true,
    });
    const body = Object.assign(Object.create(null) as object, {
      version: 1,
      changes: [change],
    });

    expect(parseReminderPatch(body)).toEqual([select('class', A)]);
  });

  it('поле __proto__ — лишнее поле', () => {
    const change = JSON.parse(
      `{"kind":"class","id":"${A}","selected":true,"__proto__":{}}`,
    ) as unknown;

    expect(() => parseReminderPatch({ version: 1, changes: [change] })).toThrow(
      InvalidInputError,
    );
  });
});

describe('applyReminderChanges', () => {
  const state = (patch: Partial<ReminderState> = {}): ReminderState => ({
    classIds: [],
    lessonIds: [],
    leadMinutes: null,
    ...patch,
  });

  it('добавление: выбор появляется, изменение засчитано', () => {
    const result = applyReminderChanges(state(), [
      select('class', B),
      select('lesson', A),
    ]);

    expect(result).toEqual({
      next: { classIds: [B], lessonIds: [A], leadMinutes: null },
      changed: true,
    });
  });

  it('снятие: выбор исчезает, остальное не тронуто', () => {
    const result = applyReminderChanges(state({ classIds: [A, B], lessonIds: [C] }), [
      select('class', A, false),
    ]);

    expect(result.next).toEqual({ classIds: [B], lessonIds: [C], leadMinutes: null });
    expect(result.changed).toBe(true);
  });

  it('снятие невыбранного — без изменений', () => {
    const before = state({ classIds: [B] });

    const result = applyReminderChanges(before, [
      select('class', A, false),
      select('lesson', A, false),
    ]);

    expect(result).toEqual({ next: before, changed: false });
  });

  it('повтор выбранного — без изменений', () => {
    const before = state({ classIds: [A], lessonIds: [B], leadMinutes: 30 });

    const result = applyReminderChanges(before, [
      select('class', A),
      select('lesson', B),
      { kind: 'lead', minutes: 30 },
    ]);

    expect(result).toEqual({ next: before, changed: false });
  });

  it.each([
    [null, 0],
    [null, 120],
    [30, 0],
    [0, 120],
    [120, null],
    [0, null],
  ])('минуты %p → %p: изменение', (from, to) => {
    const result = applyReminderChanges(state({ leadMinutes: from }), [
      { kind: 'lead', minutes: to as 0 | 120 | null },
    ]);

    expect(result).toEqual({ next: state({ leadMinutes: to }), changed: true });
  });

  it.each([null, 0, 15, 120] as const)(
    'минуты %p повтором — без изменений',
    (minutes) => {
      expect(
        applyReminderChanges(state({ leadMinutes: minutes }), [{ kind: 'lead', minutes }])
          .changed,
      ).toBe(false);
    },
  );

  it('смесь: выбор, снятие, минуты — одним пакетом', () => {
    const result = applyReminderChanges(
      state({ classIds: [A], lessonIds: [B], leadMinutes: 15 }),
      [
        select('class', C),
        select('class', A, false),
        select('lesson', A),
        select('lesson', B, false),
        { kind: 'lead', minutes: null },
      ],
    );

    expect(result).toEqual({
      next: { classIds: [C], lessonIds: [A], leadMinutes: null },
      changed: true,
    });
  });

  it('порядок изменений в пакете на результат не влияет', () => {
    const changes: ReminderChange[] = [
      select('class', C),
      select('class', A, false),
      select('lesson', A),
      { kind: 'lead', minutes: 60 },
    ];
    const before = state({ classIds: [A, B], lessonIds: [B] });

    const forward = applyReminderChanges(before, changes);
    const backward = applyReminderChanges(before, [...changes].reverse());

    expect(backward).toEqual(forward);
  });

  it('списки результата отсортированы и без повторов, исходное состояние не меняется', () => {
    const before = state({ classIds: [B, B, A] });

    const { next } = applyReminderChanges(before, [select('class', C)]);

    expect(next.classIds).toEqual([C, A, B]);
    expect(before.classIds).toEqual([B, B, A]);
  });
});
