// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts» — компонент никогда
// не видит fetch напрямую, подменяем именно эту точку).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import ScheduleScreen from './ScheduleScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань, средняя группа',
    groupLabel: '',
    format: 'online',
    rules: [{ id: 'r1', weekday: 2, time: '19:00', durationMin: 60 }],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <ScheduleScreen />
    </MemoryRouter>,
  );
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('ScheduleScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и «Обновить», клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
    const retry = screen.getByRole('button', { name: 'Обновить' });

    mockedApiFetch.mockResolvedValueOnce([makeClass()]);
    await user.click(retry);

    expect(await screen.findByText(/19:00–20:00/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ScheduleScreen — загрузка', () => {
  it('показывает скелетон, пока список не пришёл', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));

    const { container } = renderScreen();

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('ScheduleScreen — пустая база', () => {
  it('объясняющий текст остаётся и появляется кнопка «Добавить занятие»', async () => {
    mockedApiFetch.mockResolvedValue([]);

    renderScreen();

    expect(await screen.findByText(/Пока в расписании нет занятий/)).toBeInTheDocument();
    expect(screen.getByText(/Здесь расписание школы/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить занятие' })).toBeInTheDocument();
  });
});

describe('ScheduleScreen — список занятий (десктоп, сетка семи колонок)', () => {
  it('рендерит карточку слота в колонке своего дня, все 7 подписей дней видны', async () => {
    mockedApiFetch.mockResolvedValue([makeClass()]);

    renderScreen();

    expect(await screen.findByText(/19:00–20:00/)).toBeInTheDocument();
    expect(screen.getAllByText(/^(Вс|Пн|Вт|Ср|Чт|Пт|Сб)$/)).toHaveLength(7);
  });
});

describe('ScheduleScreen — список занятий (мобильный, ревью п.15)', () => {
  it('<768px — вертикальный список, пустые дни скрыты (не 7 подписей)', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    );
    mockedApiFetch.mockResolvedValue([makeClass()]);

    renderScreen();

    expect(await screen.findByText(/19:00–20:00/)).toBeInTheDocument();
    expect(screen.getAllByText(/^(Вс|Пн|Вт|Ср|Чт|Пт|Сб)$/)).toHaveLength(1);

    vi.unstubAllGlobals();
  });
});

describe('ScheduleScreen — лист занятия', () => {
  it('открыть карточку, сохранить — apiFetch вызван с PATCH на /classes/:id', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([makeClass()]);

    renderScreen();
    const card = await screen.findByText(/19:00–20:00/);
    await user.click(card);

    const dialogTitle = await screen.findByRole('heading', { name: 'Занятие' });
    const sheet = dialogTitle.closest('form') as HTMLFormElement;

    mockedApiFetch.mockResolvedValueOnce(makeClass());
    mockedApiFetch.mockResolvedValueOnce([makeClass()]);

    await user.click(within(sheet).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/classes/c1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  it('«Добавить занятие» открывает пустой лист — сохранение шлёт POST', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Добавить занятие' }));

    const dialogTitle = await screen.findByRole('heading', { name: 'Новое занятие' });
    const sheet = dialogTitle.closest('form') as HTMLFormElement;
    await user.type(within(sheet).getByLabelText('Название'), 'Цигун для глаз');
    await user.click(within(sheet).getByRole('button', { name: 'Добавить время' }));
    fireEvent.change(within(sheet).getByLabelText('Время начала'), {
      target: { value: '10:00' },
    });

    mockedApiFetch.mockResolvedValueOnce(makeClass());
    mockedApiFetch.mockResolvedValueOnce([]);

    await user.click(within(sheet).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/classes',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});

describe('ScheduleScreen — пояс и ссылки (отзыв владельца 2026-09-12)', () => {
  it('два занятия в поясе школы — подпись про часы школы одна на экран', async () => {
    mockedApiFetch.mockResolvedValue([
      makeClass(),
      makeClass({
        id: 'c2',
        rules: [{ id: 'r2', weekday: 4, time: '08:00', durationMin: 60 }],
      }),
    ]);

    renderScreen();

    expect(
      await screen.findByText('Время в сетке — по часам школы (Asia/Jerusalem).'),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Asia\/Jerusalem/)).toHaveLength(1);
  });

  it('онлайн-занятие без ссылки Zoom — «без ссылки» на карточке слота', async () => {
    mockedApiFetch.mockResolvedValue([makeClass()]);

    renderScreen();

    expect(await screen.findByText('без ссылки')).toBeInTheDocument();
  });

  it('ссылка заполнена — пометки нет', async () => {
    mockedApiFetch.mockResolvedValue([
      makeClass({ zoomLink: 'https://us02web.zoom.us/j/1' }),
    ]);

    renderScreen();

    await screen.findByText(/19:00–20:00/);
    expect(screen.queryByText('без ссылки')).not.toBeInTheDocument();
  });
});
