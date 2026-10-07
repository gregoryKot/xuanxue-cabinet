import { describe, expect, it } from 'vitest';
import { SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE } from '@xuanxue/shared';
import { fromDatetimeLocalValue } from '../lib/formatDate';
import { makeSchoolEvent } from '../test-support/schoolEventFixture';
import {
  initialEventFormState,
  toCreateInput,
  toUpdateInput,
  validateEventForm,
  type EventFormState,
} from './eventFormInput';

function makeState(overrides: Partial<EventFormState> = {}): EventFormState {
  return {
    title: 'Ретрит в Галилее',
    startsAtLocal: '2030-11-14T10:00',
    endsAtLocal: '',
    place: '',
    description: '',
    ...overrides,
  };
}

describe('initialEventFormState', () => {
  it('новое событие — пустая форма', () => {
    expect(initialEventFormState(null)).toEqual({
      title: '',
      startsAtLocal: '',
      endsAtLocal: '',
      place: '',
      description: '',
    });
  });

  it('существующее — поля из события, даты в формате datetime-local', () => {
    const state = initialEventFormState(
      makeSchoolEvent({
        startsAt: '2030-11-14T08:00:00.000Z',
        endsAt: '2030-11-16T15:00:00.000Z',
        place: 'Кибуц Амиад',
        description: 'Взять **спальник**',
      }),
    );

    expect(state.title).toBe('Ретрит в Галилее');
    expect(fromDatetimeLocalValue(state.startsAtLocal)).toBe('2030-11-14T08:00:00.000Z');
    expect(fromDatetimeLocalValue(state.endsAtLocal)).toBe('2030-11-16T15:00:00.000Z');
    expect(state.place).toBe('Кибуц Амиад');
    expect(state.description).toBe('Взять **спальник**');
  });
});

describe('validateEventForm', () => {
  it('полная форма валидна', () => {
    expect(validateEventForm(makeState({ endsAtLocal: '2030-11-16T15:00' }))).toBeNull();
  });

  it('нет названия — ошибка у названия, пробелы не считаются', () => {
    expect(validateEventForm(makeState({ title: '   ' }))).toEqual({
      field: 'title',
      message: 'Впишите название события.',
    });
  });

  it('нет начала — ошибка у начала', () => {
    expect(validateEventForm(makeState({ startsAtLocal: '' }))).toEqual({
      field: 'startsAt',
      message: 'Укажите, когда событие начинается.',
    });
  });

  it('начало не разобралось — ошибка у начала', () => {
    expect(validateEventForm(makeState({ startsAtLocal: 'не дата' }))?.field).toBe(
      'startsAt',
    );
  });

  it('конец не разобрался — ошибка у конца', () => {
    expect(validateEventForm(makeState({ endsAtLocal: 'не дата' }))).toEqual({
      field: 'endsAt',
      message: 'Дата и время конца указаны неверно.',
    });
  });

  it('конец раньше начала — ошибка у конца с текстом контракта', () => {
    expect(validateEventForm(makeState({ endsAtLocal: '2030-11-14T09:00' }))).toEqual({
      field: 'endsAt',
      message: SCHOOL_EVENT_ENDS_BEFORE_START_MESSAGE,
    });
  });

  it('конец равен началу — допустимо, как на сервере', () => {
    expect(validateEventForm(makeState({ endsAtLocal: '2030-11-14T10:00' }))).toBeNull();
  });
});

describe('toCreateInput', () => {
  it('пустые необязательные поля не уходят вовсе', () => {
    expect(toCreateInput(makeState({ place: '  ', description: '' }))).toEqual({
      title: 'Ретрит в Галилее',
      startsAt: fromDatetimeLocalValue('2030-11-14T10:00'),
    });
  });

  it('заполненные поля уходят обрезанными, даты — ISO UTC с Z', () => {
    const input = toCreateInput(
      makeState({
        title: ' Ретрит ',
        endsAtLocal: '2030-11-16T15:00',
        place: ' Кибуц Амиад ',
        description: ' Взять спальник ',
      }),
    );

    expect(input).toEqual({
      title: 'Ретрит',
      startsAt: fromDatetimeLocalValue('2030-11-14T10:00'),
      endsAt: fromDatetimeLocalValue('2030-11-16T15:00'),
      place: 'Кибуц Амиад',
      description: 'Взять спальник',
    });
    expect(input.startsAt.endsWith('Z')).toBe(true);
  });
});

describe('toUpdateInput', () => {
  it('очищенные конец, место и подробности уходят null — это сброс', () => {
    expect(toUpdateInput(makeState({ place: '', description: '  ' }))).toEqual({
      title: 'Ретрит в Галилее',
      startsAt: fromDatetimeLocalValue('2030-11-14T10:00'),
      endsAt: null,
      place: null,
      description: null,
    });
  });

  it('заполненные поля уходят значениями', () => {
    expect(
      toUpdateInput(
        makeState({
          endsAtLocal: '2030-11-16T15:00',
          place: 'Кибуц Амиад',
          description: 'Взять спальник',
        }),
      ),
    ).toMatchObject({
      endsAt: fromDatetimeLocalValue('2030-11-16T15:00'),
      place: 'Кибуц Амиад',
      description: 'Взять спальник',
    });
  });
});
