// Смоук-тест маршрутов (CLAUDE.md «Тесты»: ветвление есть — гость на /login,
// «/» уводит на /summary) — сами экраны и их логика проверены отдельными
// тестами (LoginScreen, RequireAuth, ScheduleScreen, SummaryScreen).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import App from './App';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('App', () => {
  it('гость на «/» — попадает на экран входа', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({});
      return Promise.reject(new Error('нет сессии'));
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Кабинет школы Сюань-Сюэ')).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Вход через Telegram не настроен. Напишите администратору школы.',
      ),
    ).toBeInTheDocument();
  });

  it('учитель на /channels — маршрут «Каналы» открывает ChannelsScreen (ревью п.17)', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({});
      if (path === '/auth/me')
        return Promise.resolve({
          id: 'u1',
          name: 'Дима',
          roles: ['teacher'],
          tz: 'Asia/Jerusalem',
        });
      if (path.startsWith('/channels')) return Promise.resolve([]);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    render(
      <MemoryRouter initialEntries={['/channels']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Telegram-группа подключается сама/),
    ).toBeInTheDocument();
  });

  it('неизвестный путь для гостя — тоже уводит на экран входа (через «/»)', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({});
      return Promise.reject(new Error('нет сессии'));
    });

    render(
      <MemoryRouter initialEntries={['/что-то-неизвестное']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Кабинет школы Сюань-Сюэ')).toBeInTheDocument();
  });
});
