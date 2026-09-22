// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts»).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

const NEW_MARKER = 'Здесь страница нового вопроса';
const EDITOR_MARKER = 'Здесь страница вопроса';

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
    <MemoryRouter initialEntries={['/exam-items']}>
      <Routes>
        <Route path="/exam-items" element={<ExamItemsScreen />} />
        <Route path="/exam-items/new" element={<p>{NEW_MARKER}</p>} />
        <Route path="/exam-items/:itemId" element={<p>{EDITOR_MARKER}</p>} />
      </Routes>
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
  it('заголовок раздела и честный текст вместо списка', async () => {
    mockedApiFetch.mockResolvedValue([]);

    renderScreen();

    expect(
      await screen.findByText(/Вопросов пока нет\. Добавьте первый/),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Вопросы' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Новый вопрос' })).toBeInTheDocument();
  });
});

describe('ExamItemsScreen — список вопросов', () => {
  it('рендерит строку с формулировкой, типом и статусом', async () => {
    mockedApiFetch.mockResolvedValue([makeItem()]);

    renderScreen();

    expect(await screen.findByText('Опишите принцип песчинки')).toBeInTheDocument();
    expect(screen.getByText(/Свободный ответ · Черновик/)).toBeInTheDocument();
  });
});

describe('ExamItemsScreen — фильтры', () => {
  it('переключатель статуса уходит в query запроса', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);

    renderScreen();
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Опубликован' }));

    await waitFor(() => {
      const lastCall = mockedApiFetch.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain('status=published');
    });
  });

  it('поиск по формулировке оставляет подходящие вопросы', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([
      makeItem({ id: 'e1', prompt: 'Опишите принцип песчинки' }),
      makeItem({ id: 'e2', prompt: 'Зачем придумали тайцзи?' }),
    ]);

    renderScreen();
    await screen.findByText('Опишите принцип песчинки');

    await user.type(screen.getByLabelText('Поиск по вопросу и тегу'), 'тайцзи');

    expect(screen.getByText('Зачем придумали тайцзи?')).toBeInTheDocument();
    expect(screen.queryByText('Опишите принцип песчинки')).not.toBeInTheDocument();
  });

  it('поиск по тегу тоже находит', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([
      makeItem({ id: 'e1', prompt: 'Опишите принцип песчинки', tags: ['дыхание'] }),
      makeItem({ id: 'e2', prompt: 'Зачем придумали тайцзи?', tags: ['история'] }),
    ]);

    renderScreen();
    await screen.findByText('Опишите принцип песчинки');

    await user.type(screen.getByLabelText('Поиск по вопросу и тегу'), 'дыхание');

    expect(screen.getByText('Опишите принцип песчинки')).toBeInTheDocument();
    expect(screen.queryByText('Зачем придумали тайцзи?')).not.toBeInTheDocument();
  });

  it('по запросу ничего не нашлось — текст про фильтры, не про пустой список', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([makeItem()]);

    renderScreen();
    await screen.findByText('Опишите принцип песчинки');

    await user.type(screen.getByLabelText('Поиск по вопросу и тегу'), 'веник');

    expect(screen.getByText('С такими фильтрами вопросов нет.')).toBeInTheDocument();
  });
});

describe('ExamItemsScreen — переходы на страницу вопроса', () => {
  it('«Новый вопрос» ведёт на /exam-items/new', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Новый вопрос' }));

    expect(screen.getByText(NEW_MARKER)).toBeInTheDocument();
  });

  it('строка списка ведёт на страницу своего вопроса', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([makeItem()]);

    renderScreen();
    await user.click(await screen.findByText('Опишите принцип песчинки'));

    expect(screen.getByText(EDITOR_MARKER)).toBeInTheDocument();
  });
});
