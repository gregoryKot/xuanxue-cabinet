import { describe, expect, it } from 'vitest';
import { TAG_LIMITS, type ClassDto } from '@xuanxue/shared';
import { ALL_GROUPS_CHOICE } from '../groups/groupChoice';
import {
  initialClassFormState,
  toCreateInput,
  toUpdateInput,
  validateClassForm,
  type ClassFormState,
} from './classFormInput';

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань',
    groupLabel: 'средняя группа',
    groupId: null,
    forAllGroups: false,
    format: 'online',
    zoomLink: 'https://zoom.example/1',
    zoomPassword: '1234',
    rules: [{ id: 'r1', weekday: 2, time: '19:00', durationMin: 60 }],
    tz: 'Europe/Moscow',
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
    groupChoice: '',
    format: 'online',
    zoomLink: '',
    zoomPassword: '',
    leadMinutesText: '30',
    active: true,
    tz: 'Asia/Jerusalem',
    leaderId: '',
    tagsText: '',
    rules: [
      { weekday: 1, time: '19:00', durationMinText: '60', everyWeeks: 1, startsOn: '' },
    ],
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
      {
        id: 'r1',
        weekday: 2,
        time: '19:00',
        durationMinText: '60',
        everyWeeks: 1,
        startsOn: '',
      },
    ]);
  });

  it('занятие раз в две недели — частота и дата первого занятия попадают в строку правила (ADR-0168)', () => {
    const state = initialClassFormState(
      makeClass({
        rules: [
          {
            id: 'r1',
            weekday: 5,
            time: '20:00',
            durationMin: 90,
            everyWeeks: 2,
            startsOn: '2026-10-02',
          },
        ],
      }),
    );
    expect(state.rules).toEqual([
      {
        id: 'r1',
        weekday: 5,
        time: '20:00',
        durationMinText: '90',
        everyWeeks: 2,
        startsOn: '2026-10-02',
      },
    ]);
  });

  it('существующее занятие с тегами — собраны в строку через запятую (ADR-0072)', () => {
    const state = initialClassFormState(makeClass({ tags: ['начинающие', 'медитация'] }));
    expect(state.tagsText).toBe('начинающие, медитация');
  });

  it('существующее занятие — группа переносится как есть (ADR-0195)', () => {
    const state = initialClassFormState(makeClass({ groupId: 'g1' }));
    expect(state.groupChoice).toBe('g1');
  });

  it('занятие для всех групп — выбор «Все группы»', () => {
    const state = initialClassFormState(makeClass({ forAllGroups: true }));
    expect(state.groupChoice).toBe(ALL_GROUPS_CHOICE);
  });

  it('создание и занятие без группы — «Без группы», пока группу не выберут', () => {
    expect(initialClassFormState(null).groupChoice).toBe('');
    expect(initialClassFormState(makeClass({ groupId: null })).groupChoice).toBe('');
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
        baseState({
          rules: [
            { weekday: 1, time: '', durationMinText: '60', everyWeeks: 1, startsOn: '' },
          ],
        }),
      ),
    ).toMatch(/время/);
  });

  it('пустая длительность — ошибка, не «0 минут»', () => {
    expect(
      validateClassForm(
        baseState({
          rules: [
            {
              weekday: 1,
              time: '19:00',
              durationMinText: '',
              everyWeeks: 1,
              startsOn: '',
            },
          ],
        }),
      ),
    ).toMatch(/Длительность/);
  });

  it('длительность вне диапазона CLASS_LIMITS — ошибка', () => {
    expect(
      validateClassForm(
        baseState({
          rules: [
            {
              weekday: 1,
              time: '19:00',
              durationMinText: '1',
              everyWeeks: 1,
              startsOn: '',
            },
          ],
        }),
      ),
    ).toMatch(/Длительность/);
  });

  it('раз в две недели без даты — ошибка правила, форма не уходит на сервер (ADR-0168)', () => {
    const rule = {
      weekday: 5 as const,
      time: '20:00',
      durationMinText: '90',
      everyWeeks: 2 as const,
      startsOn: '',
    };
    expect(validateClassForm(baseState({ rules: [rule] }))).toBe(
      'Впишите дату первого занятия: от неё занятие идёт через неделю.',
    );
    expect(
      validateClassForm(baseState({ rules: [{ ...rule, startsOn: '2026-10-02' }] })),
    ).toBeNull();
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

  it('правило раз в две недели уходит с everyWeeks и датой — создание и правка (ADR-0168)', () => {
    const state = baseState({
      rules: [
        {
          weekday: 5,
          time: '20:00',
          durationMinText: '90',
          everyWeeks: 2,
          startsOn: '2026-10-02',
        },
      ],
    });
    const expected = [
      {
        weekday: 5,
        time: '20:00',
        durationMin: 90,
        everyWeeks: 2,
        startsOn: '2026-10-02',
      },
    ];
    expect(toCreateInput(state).rules).toEqual(expected);
    expect(toUpdateInput(state).rules).toEqual(expected);
  });

  it('в теле запроса каналов занятия нет — маршрут задаёт только группа (ADR-0195)', () => {
    const state = baseState();
    expect(toCreateInput(state)).not.toHaveProperty('channelIds');
    expect(toUpdateInput(state)).not.toHaveProperty('channelIds');
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

describe('toCreateInput / toUpdateInput — группа занятия (ADR-0195)', () => {
  it('выбрана группа — groupId в обоих телах, «для всех» выключено, подписи нет — её берёт сервер', () => {
    const state = baseState({ groupChoice: 'g1' });

    for (const input of [toCreateInput(state), toUpdateInput(state)]) {
      expect(input).toMatchObject({ groupId: 'g1', forAllGroups: false });
      expect(input).not.toHaveProperty('groupLabel');
    }
  });

  it('«Все группы» — флаг forAllGroups, groupId пустой', () => {
    const state = baseState({ groupChoice: ALL_GROUPS_CHOICE });

    expect(toCreateInput(state)).toMatchObject({ groupId: null, forAllGroups: true });
    expect(toUpdateInput(state)).toMatchObject({ groupId: null, forAllGroups: true });
  });

  it('«Без группы» — при правке уходит null, а не «не трогать»', () => {
    const state = baseState({ groupChoice: '' });

    expect(toUpdateInput(state)).toMatchObject({ groupId: null, forAllGroups: false });
    expect(toCreateInput(state)).toMatchObject({ groupId: null, forAllGroups: false });
  });
});
