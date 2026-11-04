// Секция «Какие занятия сюда уходят» на странице канала: галочка сразу
// шлёт PATCH /classes/:id с channelIds и показывает то, что вернул сервер.
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

describe('ChannelClassesSection', () => {
  it('объяснение стоит до галочек, галочка отмечена у привязанных занятий', async () => {
    mockApiByPath({
      '/classes': [
        makeClass({ channelIds: ['ch1', 'other'] }),
        makeClass({ id: 'c2', title: 'Цигун', channelIds: [] }),
      ],
    });

    render(<ChannelClassesSection channel={CHANNEL} />);

    expect(await screen.findByLabelText('Тайцзи вт 19:00')).toBeChecked();
    expect(screen.getByLabelText('Цигун вт 19:00')).not.toBeChecked();
    expect(screen.getByText(/каждого отмеченного занятия/)).toBeInTheDocument();
  });

  it('отметка шлёт PATCH с channelIds и показывает ответ сервера', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/classes': [makeClass({ channelIds: ['other'] })] });
    render(<ChannelClassesSection channel={CHANNEL} />);
    const box = await screen.findByLabelText('Тайцзи вт 19:00');

    mockApiByPath({ '/classes/c1': makeClass({ channelIds: ['other', 'ch1'] }) });
    await user.click(box);

    await waitFor(() => expect(box).toBeChecked());
    expect(patchCalls()).toHaveLength(1);
    expect(patchCalls()[0]?.[0]).toBe('/classes/c1');
    expect((patchCalls()[0]?.[1] as { body: unknown }).body).toEqual({
      channelIds: ['other', 'ch1'],
    });
  });

  it('снятие отметки убирает только этот канал', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/classes': [makeClass({ channelIds: ['ch1', 'other'] })] });
    render(<ChannelClassesSection channel={CHANNEL} />);
    const box = await screen.findByLabelText('Тайцзи вт 19:00');

    mockApiByPath({ '/classes/c1': makeClass({ channelIds: ['other'] }) });
    await user.click(box);

    await waitFor(() => expect(box).not.toBeChecked());
    expect((patchCalls()[0]?.[1] as { body: unknown }).body).toEqual({
      channelIds: ['other'],
    });
  });

  it('сбой — галочка остаётся прежней, текст ошибки сервера на экране', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({ '/classes': [makeClass()] });
    render(<ChannelClassesSection channel={CHANNEL} />);
    const box = await screen.findByLabelText('Тайцзи вт 19:00');

    mockApiByPath({ '/classes/c1': new ApiError('Сервис недоступен', 503, 'unknown') });
    await user.click(box);

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
    expect(box).not.toBeChecked();
    expect(box).toBeEnabled();
  });

  it('сбой без текста от сервера — запасная фраза', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/classes': [makeClass()] });
    render(<ChannelClassesSection channel={CHANNEL} />);
    const box = await screen.findByLabelText('Тайцзи вт 19:00');

    mockApiByPath({ '/classes/c1': new Error('сеть') });
    await user.click(box);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось сохранить. Попробуйте ещё раз.',
    );
  });

  it('пока запрос в пути, строка отключена', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/classes': [makeClass()] });
    render(<ChannelClassesSection channel={CHANNEL} />);
    const box = await screen.findByLabelText('Тайцзи вт 19:00');

    mockApiByPath({ '/classes/c1': new Promise(() => {}) });
    await user.click(box);

    await waitFor(() => expect(box).toBeDisabled());
  });

  it('выключенное занятие в списке с пометкой', async () => {
    mockApiByPath({ '/classes': [makeClass({ active: false })] });

    render(<ChannelClassesSection channel={CHANNEL} />);

    expect(
      await screen.findByLabelText('Тайцзи вт 19:00 (выключено)'),
    ).toBeInTheDocument();
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

    expect(await screen.findByLabelText('Тайцзи вт 19:00')).toBeInTheDocument();
  });
});
