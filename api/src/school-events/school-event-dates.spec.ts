// Юнит-тест дат события школы — без Mongo и DI.
import { DateTime } from 'luxon';
import {
  SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE,
  type UpdateSchoolEventInput,
} from '@xuanxue/shared';
import {
  type StoredSchoolEventDates,
  buildCreatePayload,
  buildUpdateCommand,
  upcomingFilter,
} from './school-event-dates';

const STORED: StoredSchoolEventDates = {
  startsAt: new Date('2026-11-10T07:00:00.000Z'),
  endsAt: new Date('2026-11-12T15:00:00.000Z'),
};

function update(
  input: UpdateSchoolEventInput,
  stored: StoredSchoolEventDates = STORED,
): ReturnType<typeof buildUpdateCommand> {
  return buildUpdateCommand(input, stored);
}

describe('buildCreatePayload', () => {
  it('разбирает даты в UTC и переносит текстовые поля', () => {
    const payload = buildCreatePayload({
      title: 'Ретрит',
      startsAt: '2026-11-10T09:00:00+02:00',
      endsAt: '2026-11-12T15:00:00Z',
      place: 'Амиад',
    });

    expect(payload.startsAt.toISOString()).toBe('2026-11-10T07:00:00.000Z');
    expect(payload.endsAt?.toISOString()).toBe('2026-11-12T15:00:00.000Z');
    expect(payload.place).toBe('Амиад');
  });

  it('без endsAt — событие в один момент', () => {
    const payload = buildCreatePayload({
      title: 'Семинар',
      startsAt: '2026-11-10T07:00:00Z',
    });

    expect(payload.endsAt).toBeUndefined();
  });

  it('конец раньше начала — InvalidInputError с понятным текстом', () => {
    expect(() =>
      buildCreatePayload({
        title: 'Ретрит',
        startsAt: '2026-11-10T07:00:00Z',
        endsAt: '2026-11-09T07:00:00Z',
      }),
    ).toThrow(SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE);
  });

  it('конец равен началу — можно', () => {
    expect(() =>
      buildCreatePayload({
        title: 'Ретрит',
        startsAt: '2026-11-10T07:00:00Z',
        endsAt: '2026-11-10T07:00:00Z',
      }),
    ).not.toThrow();
  });

  it('время без смещения — ошибка, а не молчаливый UTC', () => {
    expect(() =>
      buildCreatePayload({ title: 'Ретрит', startsAt: '2026-11-10T09:00:00' }),
    ).toThrow('startsAt');
  });
});

describe('buildUpdateCommand', () => {
  it('null у place и description — $unset, а не $set', () => {
    const command = update({ place: null, description: null });

    expect(command.$unset).toEqual({ place: '', description: '' });
    expect(command.$set).toEqual({});
  });

  it('endsAt: null сбрасывает конец', () => {
    expect(update({ endsAt: null }).$unset).toEqual({ endsAt: '' });
  });

  it('пустой PATCH ничего не трогает', () => {
    const command = update({});

    expect(command.$set).toEqual({});
    expect(command.$unset).toBeUndefined();
  });

  it('новое начало позже сохранённого конца — ошибка', () => {
    expect(() => update({ startsAt: '2026-11-20T07:00:00Z' })).toThrow(
      SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE,
    );
  });

  it('новое начало позже конца, но конец сбрасывается тем же запросом — можно', () => {
    const command = update({ startsAt: '2026-11-20T07:00:00Z', endsAt: null });

    expect(command.$set.startsAt).toEqual(new Date('2026-11-20T07:00:00Z'));
  });

  it('новый конец раньше сохранённого начала — ошибка', () => {
    expect(() => update({ endsAt: '2026-11-09T07:00:00Z' })).toThrow(
      SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE,
    );
  });

  it('у события без конца новый конец сверяется с начальным началом', () => {
    const noEnd = { startsAt: STORED.startsAt };

    expect(() => update({ endsAt: '2026-11-09T07:00:00Z' }, noEnd)).toThrow(
      SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE,
    );
    expect(update({ startsAt: '2026-12-01T07:00:00Z' }, noEnd).$set.startsAt).toEqual(
      new Date('2026-12-01T07:00:00Z'),
    );
  });

  it('null у названия — защита в глубину: нельзя очистить', () => {
    const bad = { title: null } as unknown as UpdateSchoolEventInput;

    expect(() => update(bad)).toThrow('title');
  });
});

describe('upcomingFilter', () => {
  it('граница — «сейчас» в UTC: конец или начало не раньше неё', () => {
    const now = DateTime.fromISO('2026-11-11T10:00:00', { zone: 'Asia/Jerusalem' });

    const boundary = new Date('2026-11-11T08:00:00.000Z');
    expect(upcomingFilter(now)).toEqual({
      $or: [
        { endsAt: { $gte: boundary } },
        { endsAt: { $exists: false }, startsAt: { $gte: boundary } },
      ],
    });
  });
});
