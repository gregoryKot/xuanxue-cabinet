// Секция «Какие занятия сюда уходят» на странице канала: строка — курс,
// отметка сразу шлёт PATCH /classes/:id для каждого занятия курса и
// показывает то, что вернул сервер.
// Мок сети — по пути (mockApiByPath), не очередью `…Once`.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelDto, ClassDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { ChannelClassesSection } from './ChannelClassesSection';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const CHANNEL: ChannelDto = {
  id: 'ch1',
  type: 'telegram',
  title: 'Группа',
  active: true,
  target: '-100',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзи',
    groupLabel: '',
    groupIds: [],
    format: 'online',
    rules: [{ id: 'r1', weekday: 2, time: '19:00', durationMin: 60 }],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function patchCalls() {
  return mockedApiFetch.mock.calls.filter(
    (call) => (call[1] as { method?: string } | undefined)?.method === 'PATCH',
  );
}

function patchBodies(): Record<string, unknown> {
  return Object.fromEntries(
    patchCalls().map((call) => [call[0], (call[1] as { body: unknown }).body]),
  );
}

const MON = [{ id: 'r1', weekday: 1 as const, time: '19:00', durationMin: 60 }];
const TUE = [{ id: 'r2', weekday: 2 as const, time: '19:00', durationMin: 60 }];
const SUN = [{ id: 'r3', weekday: 0 as const, time: '20:00', durationMin: 60 }];

function course(linked: boolean[]): ClassDto[] {
  const rules = [SUN, TUE, MON];
  return linked.map((on, i) =>
    makeClass({
      id: `c${i}`,
      rules: rules[i % rules.length],
      channelIds: on ? ['ch1', 'other'] : ['other'],
    }),
  );
}

describe('ChannelClassesSection', () => {
  it('одна строка на курс с днями по порядку недели; объяснение до галочек', async () => {
    mockApiByPath({
      '/classes': [...course([true, true, true]), makeClass({ id: 'z', title: 'Цигун' })],
    });

    render(<ChannelClassesSection channel={CHANNEL} />);

    const box = await screen.findByLabelText('Тайцзи');
    expect(box).toBeChecked();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByLabelText('Цигун')).not.toBeChecked();
    expect(screen.getByText('пн 19:00, вт 19:00, вс 20:00')).toBeInTheDocument();
    expect(screen.getByText(/каждого отмеченного курса/)).toBeInTheDocument();
  });

  it('часть занятий курса привязана — «частично»', async () => {
    mockApiByPath({ '/classes': course([true, false]) });

    render(<ChannelClassesSection channel={CHANNEL} />);

    const box = await screen.findByLabelText<HTMLInputElement>('Тайцзи');
    expect(box).not.toBeChecked();
    expect(box.indeterminate).toBe(true);
    expect(box).toHaveAttribute('aria-checked', 'mixed');
  });

  it('клик по «частично» отмечает только непривязанные занятия курса', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/classes': course([true, false, false]) });
    render(<ChannelClassesSection channel={CHANNEL} />);
    const box = await screen.findByLabelText('Тайцзи');

    mockApiByPath({
      '/classes/c1': course([true, true])[1],
      '/classes/c2': course([true, true, true])[2],
    });
    await user.click(box);

    await waitFor(() => expect(box).toBeChecked());
    expect(patchBodies()).toEqual({
      '/classes/c1': { channelIds: ['other', 'ch1'] },
      '/classes/c2': { channelIds: ['other', 'ch1'] },
    });
  });

  it('клик по отмеченному курсу снимает все его занятия, чужие каналы целы', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/classes': course([true, true]) });
    render(<ChannelClassesSection channel={CHANNEL} />);
    const box = await screen.findByLabelText('Тайцзи');

    mockApiByPath({
      '/classes/c0': course([false, false])[0],
      '/classes/c1': course([false, false])[1],
    });
    await user.click(box);

    await waitFor(() => expect(box).not.toBeChecked());
    expect(patchBodies()).toEqual({
      '/classes/c0': { channelIds: ['other'] },
      '/classes/c1': { channelIds: ['other'] },
    });
  });

  it('«Снять все» снимает привязанные, «Отметить все» тогда не прячется', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/classes': [...course([true]), makeClass({ id: 'z', title: 'Цигун' })],
    });
    render(<ChannelClassesSection channel={CHANNEL} />);
    await screen.findByLabelText('Тайцзи');
    expect(screen.getByRole('button', { name: 'Отметить все' })).toBeInTheDocument();

    mockApiByPath({ '/classes/c0': course([false])[0] });
    await user.click(screen.getByRole('button', { name: 'Снять все' }));

    await waitFor(() => expect(screen.getByLabelText('Тайцзи')).not.toBeChecked());
    expect(patchBodies()).toEqual({ '/classes/c0': { channelIds: ['other'] } });
    expect(screen.queryByRole('button', { name: 'Снять все' })).not.toBeInTheDocument();
  });

  it('«Отметить все» шлёт запросы только непривязанным занятиям', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/classes': [...course([true]), makeClass({ id: 'z', title: 'Цигун' })],
    });
    render(<ChannelClassesSection channel={CHANNEL} />);
    await screen.findByLabelText('Тайцзи');

    mockApiByPath({
      '/classes/z': makeClass({ id: 'z', title: 'Цигун', channelIds: ['ch1'] }),
    });
    await user.click(screen.getByRole('button', { name: 'Отметить все' }));

    await waitFor(() => expect(screen.getByLabelText('Цигун')).toBeChecked());
    expect(patchBodies()).toEqual({ '/classes/z': { channelIds: ['ch1'] } });
    expect(
      screen.queryByRole('button', { name: 'Отметить все' }),
    ).not.toBeInTheDocument();
  });

  it('сбой — отметка остаётся как на сервере, текст ошибки на экране', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({ '/classes': course([false, false]) });
    render(<ChannelClassesSection channel={CHANNEL} />);
    const box = await screen.findByLabelText('Тайцзи');

    mockApiByPath({ '/classes/c': new ApiError('Сервис недоступен', 503, 'unknown') });
    await user.click(box);

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
    expect(box).not.toBeChecked();
    expect(box).toBeEnabled();
  });

  it('сбой без текста от сервера — запасная фраза', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/classes': course([false]) });
    render(<ChannelClassesSection channel={CHANNEL} />);
    const box = await screen.findByLabelText('Тайцзи');

    mockApiByPath({ '/classes/c0': new Error('сеть') });
    await user.click(box);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось сохранить. Попробуйте ещё раз.',
    );
  });

  it('пока запрос в пути, строка и кнопки отключены', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/classes': course([false]) });
    render(<ChannelClassesSection channel={CHANNEL} />);
    const box = await screen.findByLabelText('Тайцзи');

    mockApiByPath({ '/classes/c0': new Promise(() => {}) });
    await user.click(box);

    await waitFor(() => expect(box).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Отметить все' })).toBeDisabled();
  });

  it('выключенное занятие в списке не показывается', async () => {
    mockApiByPath({ '/classes': [makeClass({ active: false })] });

    render(<ChannelClassesSection channel={CHANNEL} />);

    expect(await screen.findByText(/Занятий в расписании пока нет/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('занятий нет — честный текст', async () => {
    mockApiByPath({ '/classes': [] });

    render(<ChannelClassesSection channel={CHANNEL} />);

    expect(await screen.findByText(/Занятий в расписании пока нет/)).toBeInTheDocument();
  });

  it('занятия не загрузились — ошибка и повтор', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/classes': new Error('сеть') });
    render(<ChannelClassesSection channel={CHANNEL} />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    mockApiByPath({ '/classes': [makeClass()] });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByLabelText('Тайцзи')).toBeInTheDocument();
  });
});
