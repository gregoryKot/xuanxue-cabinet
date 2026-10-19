// Решения экрана настроек напоминаний (reminderSyncState.ts, контракт
// reminder-sync): когда можно сохранять, что делать с ответом и с ошибкой записи,
// какой снимок принимается. Чистая логика — ни сети, ни DOM.
import { describe, expect, it } from 'vitest';
import type { ApiErrorCode } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { makeClass, makeSnapshot } from '../test-support/reminderSyncFixtures';
import {
  REMINDER_SYNC_LOAD_ERROR,
  REMINDER_SYNC_NOTICE_TEXT,
  canSave,
  classifyWriteFailure,
  initialReminderSyncState,
  needsRead,
  parseReminderSnapshot,
  reminderSyncNotice,
  reminderSyncReducer,
  type ReminderSyncEvent,
  type ReminderSyncPhase,
  type ReminderSyncState,
} from './reminderSyncState';

const ME = 'u1';
const CONFIRMED = makeSnapshot({ revision: '5', classIds: ['c1'] });

function stateIn(
  phase: ReminderSyncPhase,
  overrides: Partial<ReminderSyncState> = {},
): ReminderSyncState {
  return {
    phase,
    snapshot: phase === 'loading' ? null : CONFIRMED,
    online: true,
    readError: null,
    refusal: null,
    ...overrides,
  };
}

const apiError = (status: number, code: ApiErrorCode = 'unknown', message = 'Текст') =>
  new ApiError(message, status, code);

function run(
  state: ReminderSyncState,
  ...events: ReminderSyncEvent[]
): ReminderSyncState {
  return events.reduce(reminderSyncReducer, state);
}

const saved = (body: unknown): ReminderSyncEvent => ({
  type: 'saveSucceeded',
  body,
  accountId: ME,
});
const read = (body: unknown): ReminderSyncEvent => ({
  type: 'readSucceeded',
  body,
  accountId: ME,
});

describe('canSave и needsRead', () => {
  it('сохранять можно только в покое, онлайн и поверх подтверждённого снимка', () => {
    expect(canSave(stateIn('idle'))).toBe(true);
    expect(canSave(stateIn('idle', { online: false }))).toBe(false);
    expect(canSave(stateIn('idle', { snapshot: null }))).toBe(false);
    expect(canSave(stateIn('loading'))).toBe(false);
    expect(canSave(stateIn('saving'))).toBe(false);
    expect(canSave(stateIn('verifying'))).toBe(false);
  });

  it('читать нужно при первой загрузке и после неясного исхода — второе только онлайн', () => {
    expect(needsRead(stateIn('loading'))).toBe(true);
    // Первое чтение идёт и без сети: сбой покажет баннер с повтором.
    expect(needsRead(stateIn('loading', { online: false }))).toBe(true);
    expect(needsRead(stateIn('verifying'))).toBe(true);
    expect(needsRead(stateIn('verifying', { online: false }))).toBe(false);
    expect(needsRead(stateIn('idle'))).toBe(false);
    expect(needsRead(stateIn('saving'))).toBe(false);
  });

  it('после сбоя чтения новое не уходит, пока не нажали «ещё раз»: повторов по таймеру нет', () => {
    expect(needsRead(stateIn('loading', { readError: 'сбой' }))).toBe(false);
    expect(needsRead(stateIn('verifying', { readError: 'сбой' }))).toBe(false);
  });
});

describe('reminderSyncNotice', () => {
  it.each([
    ['idle', true, null],
    ['idle', false, 'offline'],
    ['saving', false, 'offline'],
    ['loading', false, null],
    ['verifying', true, 'checking'],
    ['verifying', false, 'waitingForNetwork'],
  ] as const)('%s, онлайн: %s → %s', (phase, online, expected) => {
    expect(reminderSyncNotice(stateIn(phase, { online }))).toBe(expected);
  });

  it('проверка не удалась — отдельный статус с кнопкой, сети хватает или нет', () => {
    for (const online of [true, false]) {
      expect(reminderSyncNotice(stateIn('verifying', { online, readError: 'x' }))).toBe(
        'checkFailed',
      );
    }
  });

  it('статус «проверяем» не говорит «не сохранилось»', () => {
    expect(REMINDER_SYNC_NOTICE_TEXT.checking).toBe(
      'Не знаем, сохранилось ли, — проверяем…',
    );
  });
});

describe('parseReminderSnapshot — что считается снимком', () => {
  it('полный снимок разбирается, лишние поля отбрасываются', () => {
    const body = { ...makeSnapshot({ revision: '12', lessonIds: ['l1'] }), extra: 1 };

    expect(parseReminderSnapshot(body)).toEqual(
      makeSnapshot({ revision: '12', lessonIds: ['l1'] }),
    );
  });

  it('пустой выбор и нулевая ревизия — снимок, а не ошибка', () => {
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

  it.each([
    ['не объект', 'снимок'],
    ['null', null],
    ['массив', []],
    ['версия 2', { ...makeSnapshot(), version: 2 }],
    ['без версии', { ...makeSnapshot(), version: undefined }],
    ['accountId числом', { ...makeSnapshot(), accountId: 1 }],
    ['пустой accountId', makeSnapshot({ accountId: '' })],
    ['ревизия числом', { ...makeSnapshot(), revision: 5 }],
    ['ревизия с ведущим нулём', makeSnapshot({ revision: '05' })],
    ['отрицательная ревизия', makeSnapshot({ revision: '-1' })],
    ['дробная ревизия', makeSnapshot({ revision: '1.5' })],
    ['пустая ревизия', makeSnapshot({ revision: '' })],
    ['classIds не массив', { ...makeSnapshot(), classIds: 'c1' }],
    ['classIds с повтором', makeSnapshot({ classIds: ['c1', 'c1'] })],
    ['classIds не по возрастанию', makeSnapshot({ classIds: ['c2', 'c1'] })],
    ['lessonIds с числом', { ...makeSnapshot(), lessonIds: [1] }],
    ['lessonIds не по возрастанию', makeSnapshot({ lessonIds: ['b', 'a'] })],
    ['время вне списка', makeSnapshot({ leadMinutes: 45 })],
    ['время дробью', { ...makeSnapshot(), leadMinutes: 1.5 }],
    ['время строкой', { ...makeSnapshot(), leadMinutes: '15' }],
    ['без времени', { ...makeSnapshot(), leadMinutes: undefined }],
    ['школьное время ноль', makeSnapshot({ schoolMinutes: 0 })],
    ['школьное время дробью', makeSnapshot({ schoolMinutes: 60.5 })],
    ['школьное время строкой', { ...makeSnapshot(), schoolMinutes: '60' }],
    ['каталог не массив', { ...makeSnapshot(), classes: {} }],
    [
      'занятие без расписания',
      {
        ...makeSnapshot(),
        classes: [{ id: 'c1', title: 'а', groupLabel: '', tz: 'UTC' }],
      },
    ],
    [
      'занятие с кривой строкой расписания',
      {
        ...makeSnapshot(),
        classes: [
          { id: 'c1', title: 'а', groupLabel: '', tz: 'UTC', slots: [{ weekday: 'пн' }] },
        ],
      },
    ],
    [
      'каталог с повтором id',
      makeSnapshot({
        classes: [makeClass('c1', 'а', 1, '09:00'), makeClass('c1', 'б', 2, '10:00')],
      }),
    ],
  ])('%s — не снимок', (_name, body) => {
    expect(parseReminderSnapshot(body)).toBeNull();
  });
});

describe('classifyWriteFailure', () => {
  it.each([400, 403, 409, 413, 415])(
    '%i — отказ с текстом сервера: записи не было',
    (status) => {
      expect(
        classifyWriteFailure(apiError(status, 'unknown', 'Выберите не больше 50')),
      ).toEqual({
        kind: 'refused',
        message: 'Выберите не больше 50',
      });
    },
  );

  it('401 — вход обрабатывает глобальный слушатель, текста нет', () => {
    expect(classifyWriteFailure(apiError(401, 'unauthorized'))).toEqual({
      kind: 'unauthorized',
    });
  });

  it.each([
    ['сеть', apiError(0, 'network')],
    ['500', apiError(500)],
    ['503', apiError(503)],
    ['429 — записать могли', apiError(429, 'rate_limited')],
    ['незнакомый 404', apiError(404)],
    ['ответ 2xx не разобрался как JSON', new SyntaxError('Unexpected token')],
    ['не ошибка вовсе', 'boom'],
  ])('%s — исход неясен', (_name, error) => {
    expect(classifyWriteFailure(error)).toEqual({ kind: 'uncertain' });
  });
});

describe('первое чтение', () => {
  it('снимок ложится на экран, фаза — покой', () => {
    const next = run(initialReminderSyncState(true), read(CONFIRMED));

    expect(next).toMatchObject({ phase: 'idle', snapshot: CONFIRMED, readError: null });
    expect(canSave(next)).toBe(true);
  });

  it('сбой — текст сервера, а не-ApiError — общий текст; «ещё раз» снимает сбой', () => {
    const initial = initialReminderSyncState(true);

    const refused = run(initial, {
      type: 'readFailed',
      error: apiError(403, 'forbidden', 'Нет доступа'),
    });
    expect(refused.readError).toBe('Нет доступа');
    expect(needsRead(refused)).toBe(false);

    const unknown = run(initial, { type: 'readFailed', error: new Error('boom') });
    expect(unknown.readError).toBe(REMINDER_SYNC_LOAD_ERROR);

    const retried = run(unknown, { type: 'readRetried' });
    expect(retried.readError).toBeNull();
    expect(needsRead(retried)).toBe(true);
  });

  it('ответ без разбора и снимок чужого аккаунта — сбой загрузки, а не пустой выбор', () => {
    const initial = initialReminderSyncState(true);

    expect(run(initial, read({ version: 1 })).readError).toBe(REMINDER_SYNC_LOAD_ERROR);
    const foreign = run(initial, read(makeSnapshot({ accountId: 'other' })));
    expect(foreign).toMatchObject({
      phase: 'loading',
      snapshot: null,
      readError: REMINDER_SYNC_LOAD_ERROR,
    });
  });
});

describe('сохранение', () => {
  it('начинается только из покоя онлайн и закрывает контролы', () => {
    expect(run(stateIn('idle'), { type: 'saveStarted' }).phase).toBe('saving');
    for (const state of [
      stateIn('idle', { online: false }),
      stateIn('loading'),
      stateIn('saving'),
      stateIn('verifying'),
    ]) {
      expect(run(state, { type: 'saveStarted' })).toBe(state);
    }
  });

  it('новое сохранение стирает прошлый отказ', () => {
    const refused = stateIn('idle', { refusal: { kind: 'class', message: 'Нельзя' } });

    expect(run(refused, { type: 'saveStarted' }).refusal).toBeNull();
  });

  it('ответ записи — подтверждённый снимок, второго чтения нет', () => {
    const response = makeSnapshot({ revision: '6', classIds: ['c1', 'c2'] });
    const next = run(stateIn('saving'), saved(response));

    expect(next).toMatchObject({ phase: 'idle', snapshot: response });
    expect(needsRead(next)).toBe(false);
  });

  it('ревизия сравнивается числом, а не строкой: «10» новее «9»', () => {
    const base = stateIn('saving', { snapshot: makeSnapshot({ revision: '9' }) });
    const ten = makeSnapshot({ revision: '10' });
    expect(run(base, saved(ten)).snapshot).toEqual(ten);

    const older = stateIn('saving', { snapshot: ten });
    expect(run(older, saved(makeSnapshot({ revision: '9' }))).phase).toBe('verifying');
  });

  it('ревизия длиннее безопасного целого сравнивается точно', () => {
    const huge = '90071992547409930000';
    const base = stateIn('saving', { snapshot: makeSnapshot({ revision: huge }) });

    expect(
      run(base, saved(makeSnapshot({ revision: '90071992547409929999' }))).phase,
    ).toBe('verifying');
    expect(
      run(base, saved(makeSnapshot({ revision: '90071992547409930001' }))).phase,
    ).toBe('idle');
  });

  it('равная ревизия принимается: каталог и школьное значение живут отдельно от выбора', () => {
    const refreshed = makeSnapshot({
      revision: '5',
      classIds: ['c1'],
      schoolMinutes: 45,
    });
    const next = run(stateIn('saving'), saved(refreshed));

    expect(next.phase).toBe('idle');
    expect(next.snapshot?.schoolMinutes).toBe(45);
  });

  it.each([
    ['не снимок', { version: 1 }],
    ['пустое тело', undefined],
    ['снимок чужого аккаунта', makeSnapshot({ accountId: 'other', revision: '9' })],
    ['ревизия ниже подтверждённой', makeSnapshot({ revision: '4' })],
  ])('ответ записи: %s — исход неясен, подтверждённое остаётся', (_name, body) => {
    const next = run(stateIn('saving'), saved(body));

    expect(next).toMatchObject({
      phase: 'verifying',
      snapshot: CONFIRMED,
      readError: null,
    });
    expect(needsRead(next)).toBe(true);
  });

  it.each([400, 403, 409, 413, 415])(
    'отказ %i — текст сервера у того контрола, что сохранял; подтверждённое прежнее, сохранять снова можно',
    (status) => {
      const next = run(stateIn('saving'), {
        type: 'saveFailed',
        error: apiError(status, 'unknown', 'Выберите не больше 50 занятий.'),
        kind: 'class',
      });

      expect(next).toMatchObject({
        phase: 'idle',
        snapshot: CONFIRMED,
        refusal: { kind: 'class', message: 'Выберите не больше 50 занятий.' },
      });
      expect(canSave(next)).toBe(true);
      expect(needsRead(next)).toBe(false);
    },
  );

  it('401 — покой без текста: выход из аккаунта делает глобальный слушатель', () => {
    const next = run(stateIn('saving'), {
      type: 'saveFailed',
      error: apiError(401, 'unauthorized'),
      kind: 'lead',
    });

    expect(next).toMatchObject({ phase: 'idle', snapshot: CONFIRMED, refusal: null });
  });

  it.each([
    ['сеть', apiError(0, 'network')],
    ['5xx', apiError(502)],
    ['429', apiError(429, 'rate_limited')],
    ['2xx не разобрался', new SyntaxError('Unexpected end of JSON input')],
  ])(
    '%s — «не знаем»: подтверждённое прежнее, сохранение закрыто, нужно чтение',
    (_name, error) => {
      const next = run(stateIn('saving'), { type: 'saveFailed', error, kind: 'class' });

      expect(next).toMatchObject({
        phase: 'verifying',
        snapshot: CONFIRMED,
        refusal: null,
        readError: null,
      });
      expect(canSave(next)).toBe(false);
      expect(needsRead(next)).toBe(true);
    },
  );
});

describe('проверка после неясного исхода', () => {
  it('чтение приносит текущее состояние, сохранение снова открыто', () => {
    const current = makeSnapshot({ revision: '7', classIds: ['c2'] });
    const next = run(stateIn('verifying'), read(current));

    expect(next).toMatchObject({ phase: 'idle', snapshot: current, readError: null });
    expect(canSave(next)).toBe(true);
  });

  it('офлайн чтение ждёт сети и уходит, когда связь вернулась', () => {
    const offline = run(stateIn('saving'), {
      type: 'saveFailed',
      error: apiError(0, 'network'),
      kind: 'class',
    });
    const waiting = run(offline, { type: 'connection', online: false });
    expect(needsRead(waiting)).toBe(false);

    const back = run(waiting, { type: 'connection', online: true });
    expect(needsRead(back)).toBe(true);
  });

  it('сбой чтения — статус с кнопкой, сохранение закрыто, чтения по таймеру нет', () => {
    const failed = run(stateIn('verifying'), {
      type: 'readFailed',
      error: apiError(503),
    });

    expect(failed.readError).toBe(REMINDER_SYNC_NOTICE_TEXT.checkFailed);
    expect(failed.phase).toBe('verifying');
    expect(canSave(failed)).toBe(false);
    expect(needsRead(failed)).toBe(false);
  });

  it('«Проверить ещё раз» отправляет чтение заново, и оно приносит покой', () => {
    const failed = run(stateIn('verifying'), {
      type: 'readFailed',
      error: apiError(0, 'network'),
    });
    const retried = run(failed, { type: 'readRetried' });
    expect(needsRead(retried)).toBe(true);

    const current = makeSnapshot({ revision: '6' });
    expect(run(retried, read(current))).toMatchObject({
      phase: 'idle',
      snapshot: current,
    });
  });

  it('чтение с ревизией ниже подтверждённой и чужого аккаунта — сбой проверки, состояние прежнее', () => {
    for (const body of [
      makeSnapshot({ revision: '4' }),
      makeSnapshot({ accountId: 'other', revision: '9' }),
      { version: 1 },
    ]) {
      const next = run(stateIn('verifying'), read(body));
      expect(next).toMatchObject({
        phase: 'verifying',
        snapshot: CONFIRMED,
        readError: REMINDER_SYNC_NOTICE_TEXT.checkFailed,
      });
    }
  });

  it('чтение с равной ревизией принимается', () => {
    const same = makeSnapshot({ revision: '5', classIds: ['c1'], schoolMinutes: 30 });

    expect(run(stateIn('verifying'), read(same))).toMatchObject({
      phase: 'idle',
      snapshot: same,
    });
  });

  it('чтение стирает отказ прошлого сохранения', () => {
    const state = stateIn('verifying', { refusal: { kind: 'class', message: 'Нельзя' } });

    expect(run(state, read(makeSnapshot({ revision: '6' }))).refusal).toBeNull();
  });
});

describe('события не в своей фазе', () => {
  const strayWrites: ReminderSyncEvent[] = [
    saved(makeSnapshot({ revision: '9' })),
    { type: 'saveFailed', error: apiError(400), kind: 'class' },
  ];
  const strayReads: ReminderSyncEvent[] = [
    read(makeSnapshot({ revision: '9' })),
    { type: 'readFailed', error: apiError(500) },
  ];

  it.each([['idle'], ['loading'], ['verifying']] as const)(
    'ответ записи в фазе %s ничего не меняет',
    (phase) => {
      const state = stateIn(phase);
      expect(run(state, ...strayWrites)).toBe(state);
    },
  );

  it.each([['idle'], ['saving']] as const)(
    'чтение в фазе %s ничего не меняет',
    (phase) => {
      const state = stateIn(phase);
      expect(run(state, ...strayReads)).toBe(state);
    },
  );

  it('«ещё раз» без сбоя ничего не меняет', () => {
    const state = stateIn('verifying');
    expect(run(state, { type: 'readRetried' })).toBe(state);
  });
});

describe('связь', () => {
  it('смена онлайн/офлайн отражается; та же — тот же объект', () => {
    const state = stateIn('idle');

    expect(run(state, { type: 'connection', online: false }).online).toBe(false);
    expect(run(state, { type: 'connection', online: true })).toBe(state);
  });

  it('пропавшая сеть не отменяет идущую запись и не меняет подтверждённое', () => {
    const next = run(stateIn('saving'), { type: 'connection', online: false });

    expect(next).toMatchObject({ phase: 'saving', snapshot: CONFIRMED, online: false });
  });
});
