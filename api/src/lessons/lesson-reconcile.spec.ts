// Юнит-тесты согласования занятий с правилами — без Mongo (CLAUDE.md
// «Тесты»). Даты только с `Z` или явной зоной — CI гоняет файл ещё под
// TZ=Australia/Sydney.
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { LeanScheduleRule } from '../classes/class.schema';
import { buildLessonDocs, reconcileClass, untouchedLessonIds } from './lesson-reconcile';
import type { LessonLean } from './lesson-touched';

const iso = (value: string) => DateTime.fromISO(value, { zone: 'utc' });

const TZ = 'Asia/Jerusalem';
const RULE: LeanScheduleRule = {
  _id: new Types.ObjectId(),
  weekday: 2,
  time: '19:00',
  durationMin: 90,
};
const FROM = iso('2026-03-20T00:00:00Z');
const TO = iso('2026-04-01T00:00:00Z');
const LEAD_BOUNDARY_MS = FROM.toMillis();

const BASE_LESSON: LessonLean = {
  _id: new Types.ObjectId(),
  topic: '',
  status: 'scheduled',
  startsAt: iso('2026-03-24T17:00:00Z').toJSDate(),
  plannedAt: iso('2026-03-24T17:00:00Z').toJSDate(),
  durationMin: 90,
  recordings: [],
};

describe('reconcileClass', () => {
  it('пусто в базе — обе ожидаемых даты идут во вставку', () => {
    const plan = reconcileClass([], [RULE], TZ, LEAD_BOUNDARY_MS, FROM, TO);
    expect(plan.toDelete).toEqual([]);
    expect(plan.toMove).toEqual([]);
    expect(plan.toInsert.map((o) => o.plannedAt.toUTC().toISO())).toEqual([
      '2026-03-24T17:00:00.000Z',
      '2026-03-31T16:00:00.000Z',
    ]);
  });

  it('уже совпадает с ожидаемым — ничего не делает', () => {
    const lesson: LessonLean = { ...BASE_LESSON, ruleId: RULE._id };
    const plan = reconcileClass([lesson], [RULE], TZ, LEAD_BOUNDARY_MS, FROM, TO);
    expect(plan.toDelete).toEqual([]);
    expect(plan.toMove).toEqual([]);
    expect(plan.toInsert).toHaveLength(1); // осталась только вторая (31.03)
  });

  it('смена времени правила (19:00→18:00) переносит занятие с темой, не плодит второе', () => {
    // Тема не входит в условия переноса (startsAt===plannedAt/status/
    // recordings) — переезжает вместе с занятием, потому что сервис меняет
    // только plannedAt/startsAt/durationMin, не трогая topic.
    const movedRule: LeanScheduleRule = { ...RULE, time: '18:00' };
    const lesson: LessonLean = {
      ...BASE_LESSON,
      ruleId: RULE._id,
      topic: 'Пятое занятие цикла',
    };
    const plan = reconcileClass([lesson], [movedRule], TZ, LEAD_BOUNDARY_MS, FROM, TO);
    expect(plan.toDelete).toEqual([]);
    expect(plan.toMove).toHaveLength(1);
    expect(plan.toMove[0]?.id).toEqual(lesson._id);
    expect(plan.toMove[0]?.durationMin).toBe(90);
    expect(plan.toMove[0]?.plannedAt.toUTC().toISO()).toBe('2026-03-24T16:00:00.000Z');
  });

  it('смена дня недели правила (вторник → среда): нетронутые вторники удалены, вторник с темой остался, четыре среды на вставку', () => {
    // occurrenceAtSameLocalDate меняет только час/минуту, оставляя старый
    // день недели — кандидат на перенос остаётся вторником и не совпадает
    // ни с одним ожидаемым (теперь только среды) моментом. Это тот же
    // критерий «нет допустимого переноса», что и у смены времени за
    // горизонт (тест ниже) — не отдельная ветка кода, отдельный сценарий.
    const from = iso('2026-02-01T00:00:00Z');
    const to = iso('2026-03-01T00:00:00Z');
    const leadBoundaryMs = from.toMillis();
    const tuesdayLesson = (day: string, patch: Partial<LessonLean> = {}): LessonLean => {
      const startsAt = iso(`2026-02-${day}T17:00:00Z`).toJSDate();
      return {
        ...BASE_LESSON,
        _id: new Types.ObjectId(),
        ruleId: RULE._id,
        startsAt,
        plannedAt: startsAt,
        ...patch,
      };
    };
    const withTopic = tuesdayLesson('03', { topic: 'Тема первого занятия' });
    const untouched = [tuesdayLesson('10'), tuesdayLesson('17'), tuesdayLesson('24')];
    const wednesdayRule: LeanScheduleRule = { ...RULE, weekday: 3 };

    const plan = reconcileClass(
      [withTopic, ...untouched],
      [wednesdayRule],
      TZ,
      leadBoundaryMs,
      from,
      to,
    );

    expect(plan.toMove).toEqual([]);
    expect(plan.toDelete.map(String).sort()).toEqual(
      untouched.map((l) => String(l._id)).sort(),
    );
    expect(plan.toInsert.map((o) => o.plannedAt.toUTC().toISO())).toEqual([
      '2026-02-04T17:00:00.000Z',
      '2026-02-11T17:00:00.000Z',
      '2026-02-18T17:00:00.000Z',
      '2026-02-25T17:00:00.000Z',
    ]);
  });

  it('новое время правила уходит за пределы окна — занятие не переносится (и не остаётся висеть на старом месте)', () => {
    const from = iso('2026-02-03T06:00:00Z');
    const to = iso('2026-02-10T00:00:00Z');
    const earlyRule: LeanScheduleRule = {
      _id: RULE._id,
      weekday: 2,
      time: '01:00',
      durationMin: 90,
    };
    const lesson: LessonLean = {
      ...BASE_LESSON,
      ruleId: RULE._id,
      startsAt: iso('2026-02-03T19:00:00Z').toJSDate(),
      plannedAt: iso('2026-02-03T19:00:00Z').toJSDate(),
    };

    const plan = reconcileClass([lesson], [earlyRule], 'UTC', from.toMillis(), from, to);

    expect(plan.toMove).toEqual([]);
  });

  it('поменялась только длительность правила — переносится durationMin на месте, plannedAt тот же', () => {
    const longerRule: LeanScheduleRule = { ...RULE, durationMin: 60 };
    const lesson: LessonLean = { ...BASE_LESSON, ruleId: RULE._id, durationMin: 90 };

    const plan = reconcileClass([lesson], [longerRule], TZ, LEAD_BOUNDARY_MS, FROM, TO);

    expect(plan.toDelete).toEqual([]);
    expect(plan.toMove).toHaveLength(1);
    expect(plan.toMove[0]?.id).toEqual(lesson._id);
    expect(plan.toMove[0]?.durationMin).toBe(60);
    expect(plan.toMove[0]?.plannedAt.toMillis()).toBe(
      DateTime.fromJSDate(lesson.plannedAt, { zone: 'utc' }).toMillis(),
    );
  });

  it.each<[string, Partial<LessonLean>]>([
    [
      'уже перенесено вручную (startsAt≠plannedAt)',
      { startsAt: iso('2026-03-24T18:00:00Z').toJSDate() },
    ],
    ['отменено', { status: 'cancelled' }],
    ['есть запись', { recordings: [{ title: 'Запись' }] }],
  ])('%s — правило существует, но не двигаем и не удаляем', (_name, patch) => {
    const movedRule: LeanScheduleRule = { ...RULE, time: '18:00' };
    const lesson: LessonLean = { ...BASE_LESSON, ruleId: RULE._id, ...patch };
    const plan = reconcileClass([lesson], [movedRule], TZ, LEAD_BOUNDARY_MS, FROM, TO);
    expect(plan.toDelete).toEqual([]);
    expect(plan.toMove).toEqual([]);
  });

  it('кандидат совпадает по времени с ЧУЖИМ правилом — не считается допустимым переносом', () => {
    // expectedOccurrences хранит по одному правилу на момент — если два
    // правила класса совпали по дню/времени, карта помнит только последнее.
    // Перенос ищет совпадение своего правила, а не любого.
    const otherRule: LeanScheduleRule = {
      ...RULE,
      _id: new Types.ObjectId(),
      durationMin: 60,
    };
    const lesson: LessonLean = {
      ...BASE_LESSON,
      ruleId: RULE._id,
      startsAt: iso('2026-03-24T16:00:00Z').toJSDate(), // 18:00 местного — не совпадает с 19:00
      plannedAt: iso('2026-03-24T16:00:00Z').toJSDate(),
    };
    const plan = reconcileClass(
      [lesson],
      [RULE, otherRule],
      TZ,
      LEAD_BOUNDARY_MS,
      FROM,
      TO,
    );
    expect(plan.toMove).toEqual([]);
    expect(plan.toDelete).toEqual([lesson._id]);
  });

  it('занятие без ruleId — перенос даже не ищется, нетронутое удаляется', () => {
    const withoutRuleId: LessonLean = {
      ...BASE_LESSON,
      startsAt: iso('2026-03-24T16:00:00Z').toJSDate(), // не совпадает ни с одним ожидаемым моментом
      plannedAt: iso('2026-03-24T16:00:00Z').toJSDate(),
    };
    const plan = reconcileClass([withoutRuleId], [RULE], TZ, LEAD_BOUNDARY_MS, FROM, TO);
    expect(plan.toMove).toEqual([]);
    expect(plan.toDelete).toEqual([withoutRuleId._id]);
  });

  it('целевой момент уже занят другим занятием класса в этом тике — перенос откладывается, не дублируется', () => {
    // Пара к «коллизии переносов» на реальной Mongo (lesson-planner.service.
    // spec.ts) — здесь без второго тика: сама проверка занятости места.
    const candidate: LessonLean = { ...BASE_LESSON, _id: new Types.ObjectId() }; // уже стоит на 19:00 (24.03)
    const wantsToMove: LessonLean = {
      ...BASE_LESSON,
      _id: new Types.ObjectId(),
      ruleId: RULE._id,
      startsAt: iso('2026-03-24T16:00:00Z').toJSDate(), // 18:00 местного, метит в занятые 19:00
      plannedAt: iso('2026-03-24T16:00:00Z').toJSDate(),
    };
    const plan = reconcileClass(
      [wantsToMove, candidate],
      [RULE],
      TZ,
      LEAD_BOUNDARY_MS,
      FROM,
      TO,
    );
    expect(plan.toMove).toEqual([]);
    expect(plan.toDelete).toEqual([wantsToMove._id]);
  });

  it('правило удалено — нетронутое занятие идёт в удаление, тронутое (тема) остаётся', () => {
    const gone = new Types.ObjectId(); // правила с этим _id больше нет среди rules
    const untouched: LessonLean = {
      ...BASE_LESSON,
      _id: new Types.ObjectId(),
      ruleId: gone,
    };
    const withTopic: LessonLean = {
      ...untouched,
      _id: new Types.ObjectId(),
      topic: 'Тема',
    };
    const plan = reconcileClass(
      [untouched, withTopic],
      [],
      TZ,
      LEAD_BOUNDARY_MS,
      FROM,
      TO,
    );
    expect(plan.toDelete).toEqual([untouched._id]);
    expect(plan.toMove).toEqual([]);
  });

  it('занятие не позже границы (ссылка уже могла уйти) не трогаем', () => {
    const closeLesson: LessonLean = {
      ...BASE_LESSON,
      ruleId: new Types.ObjectId(),
      startsAt: FROM.toJSDate(),
      plannedAt: FROM.toJSDate(),
    };
    const plan = reconcileClass([closeLesson], [], TZ, LEAD_BOUNDARY_MS, FROM, TO);
    expect(plan.toDelete).toEqual([]);
  });
});

describe('untouchedLessonIds', () => {
  it('нетронутые после границы — на удаление, тронутые и близкие — нет', () => {
    const untouched: LessonLean = { ...BASE_LESSON, _id: new Types.ObjectId() };
    const touched: LessonLean = { ...BASE_LESSON, _id: new Types.ObjectId(), topic: 'x' };
    const tooClose: LessonLean = {
      ...BASE_LESSON,
      _id: new Types.ObjectId(),
      startsAt: FROM.toJSDate(),
      plannedAt: FROM.toJSDate(),
    };
    const ids = untouchedLessonIds([untouched, touched, tooClose], LEAD_BOUNDARY_MS);
    expect(ids).toEqual([untouched._id]);
  });
});

describe('buildLessonDocs', () => {
  it('строит документы без апдейта существующих (status/topic/recordings по умолчанию)', () => {
    const classId = new Types.ObjectId();
    const docs = buildLessonDocs(classId, [
      { ruleId: RULE._id, durationMin: 90, plannedAt: iso('2026-03-24T17:00:00Z') },
    ]);
    expect(docs).toEqual([
      {
        classId,
        plannedAt: iso('2026-03-24T17:00:00Z').toJSDate(),
        startsAt: iso('2026-03-24T17:00:00Z').toJSDate(),
        durationMin: 90,
        ruleId: RULE._id,
        topic: '',
        status: 'scheduled',
        recordings: [],
      },
    ]);
  });
});
