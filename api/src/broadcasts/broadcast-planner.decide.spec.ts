// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import { DateTime } from 'luxon';
import { decideBroadcast, type DecideClassInput } from './broadcast-planner.decide';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

function activeClass(overrides: Partial<DecideClassInput> = {}): DecideClassInput {
  return {
    active: true,
    format: 'online',
    channelIds: ['c1'],
    zoomLink: 'https://zoom.example/1',
    leadMinutes: 30,
    ...overrides,
  };
}

describe('decideBroadcast', () => {
  it('ещё рано — startsAt дальше now + leadMinutes + PREVIEW_MINUTES', () => {
    const decision = decideBroadcast(
      { startsAt: NOW.plus({ minutes: 36 }).toJSDate() },
      activeClass(),
      NOW,
    );
    expect(decision).toEqual({ kind: 'not_due' });
  });

  it('точно на границе окна (now + leadMinutes) — уже пора', () => {
    const decision = decideBroadcast(
      { startsAt: NOW.plus({ minutes: 30 }).toJSDate() },
      activeClass(),
      NOW,
    );
    expect(decision).toEqual({ kind: 'send' });
  });

  it('в расширенном окне предпросмотра (now + leadMinutes + 5) — тоже пора: broadcast создаётся заранее для предпросмотра', () => {
    const decision = decideBroadcast(
      { startsAt: NOW.plus({ minutes: 35 }).toJSDate() },
      activeClass(),
      NOW,
    );
    expect(decision).toEqual({ kind: 'send' });
  });

  it('тик опоздал на несколько минут — всё равно слать', () => {
    const decision = decideBroadcast(
      { startsAt: NOW.minus({ minutes: 5 }).toJSDate() },
      activeClass(),
      NOW,
    );
    expect(decision).toEqual({ kind: 'send' });
  });

  it('занятие началось больше DEFAULT_LEAD_MINUTES назад — поздно, не создавать', () => {
    const decision = decideBroadcast(
      { startsAt: NOW.minus({ minutes: 31 }).toJSDate() },
      activeClass(),
      NOW,
    );
    expect(decision).toEqual({ kind: 'too_late' });
  });

  it('занятие без класса в базе — skip с причиной', () => {
    const decision = decideBroadcast(
      { startsAt: NOW.plus({ minutes: 1 }).toJSDate() },
      undefined,
      NOW,
    );
    expect(decision).toEqual({ kind: 'skip', reason: 'занятие без класса в базе' });
  });

  it('класс выключен — skip', () => {
    const decision = decideBroadcast(
      { startsAt: NOW.plus({ minutes: 1 }).toJSDate() },
      activeClass({ active: false }),
      NOW,
    );
    expect(decision).toEqual({ kind: 'skip', reason: 'класс выключен' });
  });

  it('у класса нет каналов — skip', () => {
    const decision = decideBroadcast(
      { startsAt: NOW.plus({ minutes: 1 }).toJSDate() },
      activeClass({ channelIds: [] }),
      NOW,
    );
    expect(decision).toEqual({ kind: 'skip', reason: 'у класса нет каналов рассылки' });
  });

  it('офлайн-класс без ссылки — skip', () => {
    const decision = decideBroadcast(
      { startsAt: NOW.plus({ minutes: 1 }).toJSDate() },
      activeClass({ format: 'offline', zoomLink: undefined }),
      NOW,
    );
    expect(decision).toEqual({
      kind: 'skip',
      reason: 'офлайн-занятие, ссылка не рассылается',
    });
  });

  it('нет ни ссылки класса, ни переопределения — skip', () => {
    const decision = decideBroadcast(
      { startsAt: NOW.plus({ minutes: 1 }).toJSDate() },
      activeClass({ zoomLink: undefined }),
      NOW,
    );
    expect(decision).toEqual({ kind: 'skip', reason: 'нет ссылки на занятие' });
  });

  it('переопределённая ссылка занятия закрывает отсутствие ссылки класса', () => {
    const decision = decideBroadcast(
      {
        startsAt: NOW.plus({ minutes: 1 }).toJSDate(),
        zoomLinkOverride: 'https://zoom.example/override',
      },
      activeClass({ zoomLink: undefined }),
      NOW,
    );
    expect(decision).toEqual({ kind: 'send' });
  });

  it('both — тоже рассылается, не только online', () => {
    const decision = decideBroadcast(
      { startsAt: NOW.plus({ minutes: 1 }).toJSDate() },
      activeClass({ format: 'both' }),
      NOW,
    );
    expect(decision).toEqual({ kind: 'send' });
  });
});
