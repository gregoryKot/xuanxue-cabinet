import { describe, expect, it } from 'vitest';
import type { ClassDto, LessonDto } from '@xuanxue/shared';
import {
  initialLessonFormState,
  toCreateInput,
  toUpdateInput,
  validateLessonForm,
} from './lessonFormInput';

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань',
    groupLabel: '',
    format: 'online',
    rules: [],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeLesson(overrides: Partial<LessonDto> = {}): LessonDto {
  return {
    id: 'l1',
    classId: 'c1',
    startsAt: '2026-09-08T16:00:00.000Z',
    durationMin: 60,
    topic: 'Пятое занятие цикла',
    status: 'scheduled',
    recordings: [],
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('initialLessonFormState', () => {
  it('создание — classId первого класса из списка, пустая дата', () => {
    const state = initialLessonFormState(null, [makeClass()]);
    expect(state.classId).toBe('c1');
    expect(state.startsAtLocal).toBe('');
    expect(state.durationMinText).toBe('60');
  });

  it('создание без единого класса в списке — classId пустой', () => {
    const state = initialLessonFormState(null, []);
    expect(state.classId).toBe('');
  });

  it('правка — поля из lessonDto, дата в поясе браузера', () => {
    const state = initialLessonFormState(
      makeLesson({ zoomLinkOverride: 'https://zoom', note: 'заметка' }),
      [],
    );
    expect(state.topic).toBe('Пятое занятие цикла');
    expect(state.zoomLinkOverride).toBe('https://zoom');
    expect(state.note).toBe('заметка');
    expect(state.startsAtLocal).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('правка с ведущим — leaderId переносится, без ведущего — пустая строка', () => {
    expect(initialLessonFormState(makeLesson({ leaderId: 't1' }), []).leaderId).toBe(
      't1',
    );
    expect(initialLessonFormState(makeLesson({ leaderId: undefined }), []).leaderId).toBe(
      '',
    );
  });
});

describe('validateLessonForm', () => {
  const base = initialLessonFormState(makeLesson(), []);

  it('создание без выбранного класса — ошибка', () => {
    expect(validateLessonForm({ ...base, classId: '' }, true)).toMatch(
      /занятие расписания/,
    );
  });

  it('без даты начала — ошибка', () => {
    expect(validateLessonForm({ ...base, startsAtLocal: '' }, false)).toMatch(
      /дату и время/,
    );
  });

  it('нераспознаваемая дата начала — отдельная ошибка формата', () => {
    expect(validateLessonForm({ ...base, startsAtLocal: 'не дата' }, false)).toMatch(
      /указаны неверно/,
    );
  });

  it('длительность вне диапазона — ошибка с границами', () => {
    expect(validateLessonForm({ ...base, durationMinText: '0' }, false)).toMatch(
      /Длительность/,
    );
  });

  it('валидная форма — null', () => {
    expect(validateLessonForm(base, false)).toBeNull();
    expect(validateLessonForm({ ...base, classId: 'c1' }, true)).toBeNull();
  });
});

describe('toCreateInput / toUpdateInput', () => {
  it('toCreateInput — classId, startsAt в ISO UTC, пустая тема не отправляется', () => {
    const state = {
      ...initialLessonFormState(null, [makeClass()]),
      startsAtLocal: '2026-09-08T19:00',
    };
    const input = toCreateInput(state);
    expect(input.classId).toBe('c1');
    expect(input.startsAt).toMatch(/Z$/);
    expect(input.topic).toBeUndefined();
  });

  it('toUpdateInput — пустые zoom/note становятся null (сброс)', () => {
    const state = initialLessonFormState(makeLesson(), []);
    const input = toUpdateInput(state);
    expect(input.zoomLinkOverride).toBeNull();
    expect(input.zoomPasswordOverride).toBeNull();
    expect(input.note).toBeNull();
    expect(input.topic).toBe('Пятое занятие цикла');
  });

  it('нераспознаваемая дата начала — startsAt пустой строкой (защита типов, форма это отсекает раньше)', () => {
    const state = {
      ...initialLessonFormState(makeLesson(), []),
      startsAtLocal: 'не дата',
    };
    expect(toCreateInput(state).startsAt).toBe('');
    expect(toUpdateInput(state).startsAt).toBe('');
  });

  it('toUpdateInput — leaderId выбран, уходит как есть (аудит В4)', () => {
    const state = { ...initialLessonFormState(makeLesson(), []), leaderId: 't1' };
    expect(toUpdateInput(state).leaderId).toBe('t1');
  });

  it('toUpdateInput — leaderId «— не указан —» — null (явный сброс)', () => {
    const state = initialLessonFormState(makeLesson({ leaderId: 't1' }), []);
    expect(toUpdateInput({ ...state, leaderId: '' }).leaderId).toBeNull();
  });
});
