// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts»).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import ExamItemsScreen from './ExamItemsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'e1',
    kind: 'text',
    prompt: 'Опишите принцип песчинки',
    options: [],
    tags: [],
    status: 'draft',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <ExamItemsScreen />
    </MemoryRouter>,
  );
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('ExamItemsScreen — загрузка', () => {
  it('показывает скелетон, пока список не пришёл', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));

    const { container } = renderScreen();

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('ExamItemsScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и кнопка повтора, клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
    const retry = screen.getByRole('button', { name: 'Попробовать ещё раз' });

    mockedApiFetch.mockResolvedValueOnce([makeItem()]);
    await user.click(retry);

    expect(await screen.findByText('Опишите принцип песчинки')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ExamItemsScreen — пустая база', () => {
  it('честный текст и кнопка «Новый вопрос»', async () => {
    mockedApiFetch.mockResolvedValue([]);

    renderScreen();

    expect(
      await screen.findByText(/Вопросов пока нет\. Добавьте первый/),
    ).toBeInTheDocument();
    expect(screen.getByText(/собирается экзамен/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Новый вопрос' })).toBeInTheDocument();
  });
});

describe('ExamItemsScreen — список вопросов', () => {
  it('рендерит карточку с формулировкой, типом, статусом', async () => {
    mockedApiFetch.mockResolvedValue([makeItem()]);

    renderScreen();

    expect(await screen.findByText('Опишите принцип песчинки')).toBeInTheDocument();
    expect(screen.getByText(/Текстовый ответ · Черновик/)).toBeInTheDocument();
  });
});

describe('ExamItemsScreen — фильтр по статусу', () => {
  it('смена фильтра уходит в query запроса', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);

    renderScreen();
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());

    await user.selectOptions(screen.getByLabelText('Статус'), 'published');

    await waitFor(() => {
      const lastCall = mockedApiFetch.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('status=published');
    });
  });
});

describe('ExamItemsScreen — лист вопроса', () => {
  it('«Новый вопрос» открывает пустой лист — сохранение шлёт POST', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Новый вопрос' }));

    const dialogTitle = await screen.findByRole('heading', { name: 'Новый вопрос' });
    const sheet = dialogTitle.closest('form') as HTMLFormElement;
    await user.type(
      within(sheet).getByLabelText('Формулировка'),
      'Сколько форм в стиле Ян?',
    );

    mockedApiFetch.mockResolvedValueOnce(makeItem());
    mockedApiFetch.mockResolvedValueOnce([]);
    await user.click(within(sheet).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/exam-items',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('открыть карточку — лист правки с заполненной формулировкой', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([makeItem()]);

    renderScreen();
    await user.click(await screen.findByText('Опишите принцип песчинки'));

    const dialogTitle = await screen.findByRole('heading', { name: 'Вопрос' });
    const sheet = dialogTitle.closest('form') as HTMLFormElement;
    expect(within(sheet).getByLabelText('Формулировка')).toHaveValue(
      'Опишите принцип песчинки',
    );
  });
});
