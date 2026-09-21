import { describe, expect, it } from 'vitest';
import { TAG_LIMITS, type ChannelDto, type ClassDto } from '@xuanxue/shared';
import {
  initialClassFormState,
  toCreateInput,
  toUpdateInput,
  validateClassForm,
  type ClassFormState,
} from './classFormInput';

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'telegram',
    title: 'Группа учеников',
    active: true,
    target: '@group',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань',
    groupLabel: 'средняя группа',
    format: 'online',
    zoomLink: 'https://zoom.example/1',
    zoomPassword: '1234',
    rules: [{ id: 'r1', weekday: 2, time: '19:00', durationMin: 60 }],
    tz: 'Europe/Moscow',
    channelIds: [],
    leadMinutes: 15,
    active: true,
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function baseState(overrides: Partial<ClassFormState> = {}): ClassFormState {
  return {
    title: 'Занятие',
    groupLabel: '',
    format: 'online',
    zoomLink: '',
    zoomPassword: '',
    leadMinutesText: '30',
    active: true,
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leaderId: '',
    tagsText: '',
    rules: [{ weekday: 1, time: '19:00', durationMinText: '60' }],
    ...overrides,
  };
}

describe('initialClassFormState', () => {
  it('null (создание) — дефолт SCHOOL_TZ и DEFAULT_LEAD_MINUTES, пустые поля', () => {
    const state = initialClassFormState(null);
    expect(state.title).toBe('');
    expect(state.tz).toBe('Asia/Jerusalem');
    expect(state.leadMinutesText).toBe('30');
    expect(state.rules).toEqual([]);
    expect(state.leaderId).toBe('');
  });

  it('существующее занятие с ведущим — leaderId переносится как есть', () => {
    const state = initialClassFormState(makeClass({ leaderId: 't1' }));
    expect(state.leaderId).toBe('t1');
  });

  it('существующее занятие без ведущего — leaderId пустой (не undefined)', () => {
    const state = initialClassFormState(makeClass({ leaderId: undefined }));
    expect(state.leaderId).toBe('');
  });

  it('существующее занятие — поля и durationMin/leadMinutes переведены в строки', () => {
    const state = initialClassFormState(makeClass());
    expect(state.tz).toBe('Europe/Moscow');
    expect(state.leadMinutesText).toBe('15');
    expect(state.rules).toEqual([
      { id: 'r1', weekday: 2, time: '19:00', durationMinText: '60' },
    ]);
  });

  it('существующее занятие — channelIds переносятся как есть (ревью п.1)', () => {
    const state = initialClassFormState(makeClass({ channelIds: ['ch1', 'ch2'] }));
    expect(state.channelIds).toEqual(['ch1', 'ch2']);
  });

  it('создание: активные Telegram-каналы отмечены заранее — совпадает с тем, что уйдёт в POST', () => {
    const channels = [
      makeChannel({ id: 'ch1' }),
      makeChannel({ id: 'ch2', active: false }),
      makeChannel({ id: 'ch3', type: 'vk' }),
    ];
    const state = initialClassFormState(null, channels);
    expect(state.channelIds).toEqual(['ch1']);
  });

  it('создание без каналов в кабинете — channelIds пустой', () => {
    const state = initialClassFormState(null, []);
    expect(state.channelIds).toEqual([]);
  });

  it('существующее занятие — Telegram-каналы кабинета не подмешиваются в channelIds', () => {
    const channels = [makeChannel({ id: 'ch9' })];
    const state = initialClassFormState(makeClass({ channelIds: [] }), channels);
    expect(state.channelIds).toEqual([]);
  });

  it('существующее занятие с тегами — собраны в строку через запятую (ADR-0072)', () => {
    const state = initialClassFormState(makeClass({ tags: ['начинающие', 'медитация'] }));
    expect(state.tagsText).toBe('начинающие, медитация');
  });

  it('занятие без тегов — пустая строка, не undefined', () => {
    const state = initialClassFormState(makeClass({ tags: [] }));
    expect(state.tagsText).toBe('');
  });
});

describe('validateClassForm', () => {
  it('пустое название — ошибка', () => {
    expect(validateClassForm(baseState({ title: '  ' }))).toMatch(/название/);
  });

  it('без единого правила — ошибка «добавьте хотя бы один день»', () => {
    expect(validateClassForm(baseState({ rules: [] }))).toMatch(/хотя бы один день/);
  });

  it('пустое время правила — ошибка', () => {
    expect(
      validateClassForm(
        baseState({ rules: [{ weekday: 1, time: '', durationMinText: '60' }] }),
      ),
    ).toMatch(/время/);
  });

  it('пустая длительность — ошибка, не «0 минут»', () => {
    expect(
      validateClassForm(
        baseState({ rules: [{ weekday: 1, time: '19:00', durationMinText: '' }] }),
      ),
    ).toMatch(/Длительность/);
  });

  it('длительность вне диапазона CLASS_LIMITS — ошибка', () => {
    expect(
      validateClassForm(
        baseState({ rules: [{ weekday: 1, time: '19:00', durationMinText: '1' }] }),
      ),
    ).toMatch(/Длительность/);
  });

  it('пустое «за сколько минут слать» — ошибка, не «0»', () => {
    expect(validateClassForm(baseState({ leadMinutesText: '' }))).toMatch(
      /За сколько минут/,
    );
  });

  it('валидная форма — null', () => {
    expect(validateClassForm(baseState())).toBeNull();
  });

  it('тег длиннее лимита — ошибка с текстом тега и лимитом (ADR-0072)', () => {
    const longTag = 'а'.repeat(TAG_LIMITS.length + 1);
    expect(validateClassForm(baseState({ tagsText: `база, ${longTag}` }))).toBe(
      `Тег «${longTag}» длиннее ${TAG_LIMITS.length} символов. Сократите его.`,
    );
  });

  it('теги в пределах лимита — форма валидна', () => {
    expect(
      validateClassForm(baseState({ tagsText: 'начинающие, медитация' })),
    ).toBeNull();
  });
});

describe('toCreateInput / toUpdateInput — очистка nullable-полей (ревью п.8)', () => {
  it('создание: пустая ссылка/пароль — undefined (не отправляем поле)', () => {
    const input = toCreateInput(baseState({ zoomLink: '  ', zoomPassword: '' }));
    expect(input.zoomLink).toBeUndefined();
    expect(input.zoomPassword).toBeUndefined();
  });

  it('правка: пустая ссылка/пароль — null (явный сброс)', () => {
    const input = toUpdateInput(baseState({ zoomLink: '  ', zoomPassword: '' }));
    expect(input.zoomLink).toBeNull();
    expect(input.zoomPassword).toBeNull();
  });

  it('правка: заполненная ссылка остаётся строкой, обрезанной по краям', () => {
    const input = toUpdateInput(baseState({ zoomLink: '  https://zoom.example/1  ' }));
    expect(input.zoomLink).toBe('https://zoom.example/1');
  });

  it('числовые поля переводятся из текста в number', () => {
    const input = toCreateInput(baseState());
    expect(input.leadMinutes).toBe(30);
    expect(input.rules?.[0]).toMatchObject({ durationMin: 60 });
  });

  it('channelIds уходят в тело запроса как есть — создание и правка (ревью п.1)', () => {
    const state = baseState({ channelIds: ['ch1', 'ch2'] });
    expect(toCreateInput(state).channelIds).toEqual(['ch1', 'ch2']);
    expect(toUpdateInput(state).channelIds).toEqual(['ch1', 'ch2']);
  });

  it('leaderId выбран — уходит как есть в POST и PATCH (аудит В4)', () => {
    const state = baseState({ leaderId: 't1' });
    expect(toCreateInput(state).leaderId).toBe('t1');
    expect(toUpdateInput(state).leaderId).toBe('t1');
  });

  it('leaderId «— не указан —»: создание — undefined (не отправляем поле), правка — null (сброс)', () => {
    const state = baseState({ leaderId: '' });
    expect(toCreateInput(state).leaderId).toBeUndefined();
    expect(toUpdateInput(state).leaderId).toBeNull();
  });

  it('теги — строка через запятую превращается в массив на выходе, создание и правка (ADR-0072)', () => {
    const state = baseState({ tagsText: 'начинающие, медитация' });
    expect(toCreateInput(state).tags).toEqual(['начинающие', 'медитация']);
    expect(toUpdateInput(state).tags).toEqual(['начинающие', 'медитация']);
  });

  it('пустые теги — пустой массив, а не отсутствующее поле', () => {
    const state = baseState({ tagsText: '' });
    expect(toCreateInput(state).tags).toEqual([]);
    expect(toUpdateInput(state).tags).toEqual([]);
  });
});
