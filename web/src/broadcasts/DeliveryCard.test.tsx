import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BroadcastDto, DeliveryDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { DeliveryCard } from './DeliveryCard';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

// «Пояс школы отличается от браузерного» ниже — проверяемое условие, а не
// везение: пояс зрителя задан явно (test-support/viewerTimeZone.ts).
stubViewerTimeZone();

function makeDelivery(overrides: Partial<DeliveryDto> = {}): DeliveryDto {
  return {
    id: 'd1',
    broadcastId: 'b1',
    channelId: 'ch1',
    status: 'sent',
    attempts: 1,
    ...overrides,
  };
}

function makeBroadcast(overrides: Partial<BroadcastDto> = {}): BroadcastDto {
  return {
    id: 'b1',
    kind: 'manual',
    status: 'scheduled',
    text: 'Текст',
    scheduledAt: '2026-09-08T16:00:00Z',
    channelIds: ['ch1'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderCard(
  overrides: Partial<DeliveryDto> = {},
  props: {
    channelType?: 'telegram' | 'vk' | 'manual';
    broadcast?: BroadcastDto;
    schoolTz?: string;
  } = {},
  onSent = vi.fn().mockResolvedValue(undefined),
) {
  render(
    <ul>
      <DeliveryCard
        delivery={makeDelivery(overrides)}
        channelName="ВК школы"
        channelType={props.channelType ?? 'vk'}
        broadcast={props.broadcast}
        schoolTz={props.schoolTz}
        onSent={onSent}
      />
    </ul>,
  );
  return { onSent };
}

describe('DeliveryCard — не ручной канал (по channelType, а не по text)', () => {
  it('статус, без текста и кнопок', () => {
    renderCard({ status: 'sent', attempts: 1 }, { channelType: 'vk' });

    expect(screen.getByText(/ВК школы · Отправлено/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Скопировать' })).not.toBeInTheDocument();
  });

  it('«Попыток» показывается, только когда их больше одной', () => {
    renderCard({ status: 'sent', attempts: 1 }, { channelType: 'vk' });
    expect(screen.queryByText(/Попыток/)).not.toBeInTheDocument();
  });

  it('несколько попыток — «Попыток» видно', () => {
    renderCard({ status: 'failed', attempts: 3 }, { channelType: 'vk' });
    expect(screen.getByText(/Попыток: 3/)).toBeInTheDocument();
  });

  it('одна попытка, но есть ошибка — «Попыток» тоже видно', () => {
    renderCard(
      { status: 'failed', attempts: 1, error: 'Бот не в группе' },
      { channelType: 'telegram' },
    );
    expect(screen.getByText(/Попыток: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Бот не в группе/)).toBeInTheDocument();
  });
});

describe('DeliveryCard — ручной канал (channelType === manual)', () => {
  it('«Показать текст» догружает GET /deliveries/:id и раскрывает текст', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      broadcastId: 'b1',
      channelId: 'ch1',
      status: 'manual',
      attempts: 0,
      text: 'Через 30 минут занятие',
    });
    renderCard({ status: 'manual' }, { channelType: 'manual' });

    expect(screen.queryByText('Через 30 минут занятие')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Показать текст' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/deliveries/d1');
    expect(await screen.findByText('Через 30 минут занятие')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Скрыть текст' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('«Скопировать» без предварительного раскрытия — тоже догружает текст', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      broadcastId: 'b1',
      channelId: 'ch1',
      status: 'manual',
      attempts: 0,
      text: 'Через 30 минут занятие',
    });
    renderCard({ status: 'manual' }, { channelType: 'manual' });

    await user.click(screen.getByRole('button', { name: 'Скопировать' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/deliveries/d1');
    expect(writeText).toHaveBeenCalledWith('Через 30 минут занятие');
    expect(
      await screen.findByRole('button', { name: 'Скопировано' }),
    ).toBeInTheDocument();
  });

  it('копирование не удалось (и clipboard, и execCommand) — честная ошибка под кнопками', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- сохраняем ссылку только для restore, `this` нативному DOM-методу не нужен
    const originalExecCommand = document.execCommand;
    document.execCommand = vi.fn().mockReturnValue(false);
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      broadcastId: 'b1',
      channelId: 'ch1',
      status: 'manual',
      attempts: 0,
      text: 'Пост',
    });
    renderCard({ status: 'manual' }, { channelType: 'manual' });

    await user.click(screen.getByRole('button', { name: 'Скопировать' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось скопировать');
    document.execCommand = originalExecCommand;
  });

  it('«Отметить отправленным» — POST /deliveries/:id/mark-sent, затем onSent', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValueOnce({});
    const { onSent } = renderCard(
      { status: 'manual' },
      { channelType: 'manual' },
      vi.fn().mockResolvedValue(undefined),
    );

    await user.click(screen.getByRole('button', { name: 'Отметить отправленным' }));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/deliveries/d1/mark-sent',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('уже отправленная доставка — кнопки «Отметить отправленным» нет', () => {
    renderCard({ status: 'sent' }, { channelType: 'manual' });
    expect(
      screen.queryByRole('button', { name: 'Отметить отправленным' }),
    ).not.toBeInTheDocument();
  });

  it('время и вид рассылки — только когда broadcast передан', () => {
    renderCard(
      { status: 'manual' },
      { channelType: 'manual', broadcast: makeBroadcast({ kind: 'recording' }) },
    );

    expect(screen.getByText(/Запись/)).toBeInTheDocument();
  });

  it('пояс школы отличается от браузерного — бейдж рядом со временем (pr-k3-fixes.md п.22)', () => {
    renderCard(
      { status: 'manual' },
      {
        channelType: 'manual',
        broadcast: makeBroadcast(),
        schoolTz: 'Pacific/Auckland',
      },
    );

    expect(screen.getByText(/Pacific\/Auckland/)).toBeInTheDocument();
  });

  it('без broadcast — время и вид рассылки не показываются', () => {
    renderCard({ status: 'manual' }, { channelType: 'manual' });
    expect(
      screen.queryByText(/Разовая рассылка|Ссылка на занятие|Запись/),
    ).not.toBeInTheDocument();
  });

  it('сбой догрузки текста — текст ошибки под кнопками', async () => {
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Доставка не найдена.', 404, 'not_found'),
    );
    const user = userEvent.setup();
    renderCard({ status: 'manual' }, { channelType: 'manual' });

    await user.click(screen.getByRole('button', { name: 'Показать текст' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Доставка не найдена.');
  });

  it('сбой mark-sent — текст ошибки под кнопками', async () => {
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Доставка не найдена.', 404, 'not_found'),
    );
    const user = userEvent.setup();
    renderCard({ status: 'pending' }, { channelType: 'manual' });

    await user.click(screen.getByRole('button', { name: 'Отметить отправленным' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Доставка не найдена.');
  });
});

describe('DeliveryCard — канал не найден в channelsById', () => {
  it('channelType undefined — ведёт себя как не-ручной канал', () => {
    renderCard({ status: 'manual' }, { channelType: undefined });
    expect(screen.queryByRole('button', { name: 'Скопировать' })).not.toBeInTheDocument();
  });
});

// Переезд на «Тёплую школу» (ADR-0043): доставка легла карточкой — белая
// поверхность, мягкая тень, без границы. jsdom не вычисляет `var(--…)` —
// сравниваем ровно строку инлайн-стиля, не вычисленный цвет; у cssstyle
// сокращённое `style.borderBottom` для снятой границы отдаёт 'medium',
// поэтому спрашиваем borderBottomStyle.
describe('DeliveryCard — облик (ADR-0043)', () => {
  it('доставка — карточка var(--card) с радиусом строки списка, без границы', () => {
    renderCard({ status: 'sent' }, { channelType: 'vk' });

    const card = screen.getByRole('listitem');
    expect(card.style.background).toBe('var(--card)');
    expect(card.style.borderRadius).toBe('var(--radius-card)');
    expect(card.style.boxShadow).toBe('var(--shadow-card)');
    expect(card.style.borderBottomStyle).toBe('');
  });
});
