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

  it('учитель на /broadcasts — маршрут «Рассылки» открывает BroadcastsScreen (pr-k3-fixes.md п.20)', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({});
      if (path === '/auth/me')
        return Promise.resolve({
          id: 'u1',
          name: 'Дима',
          roles: ['teacher'],
          tz: 'Asia/Jerusalem',
        });
      if (path.startsWith('/broadcasts')) return Promise.resolve([]);
      if (path.startsWith('/deliveries')) return Promise.resolve([]);
      if (path.startsWith('/channels')) return Promise.resolve([]);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    render(
      <MemoryRouter initialEntries={['/broadcasts']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('button', { name: 'Новая рассылка' }),
    ).toBeInTheDocument();
  });

  it('учитель на /templates — маршрут «Шаблоны» открывает TemplatesScreen (pr-k3-fixes.md п.20)', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({});
      if (path === '/auth/me')
        return Promise.resolve({
          id: 'u1',
          name: 'Дима',
          roles: ['teacher'],
          tz: 'Asia/Jerusalem',
        });
      if (path.startsWith('/settings'))
        return Promise.resolve({
          templates: { lesson_link: 'Анонс', recording: 'Запись' },
          tz: 'Asia/Jerusalem',
          updatedAt: '2026-01-01T00:00:00Z',
        });
      if (path.startsWith('/lessons')) return Promise.resolve([]);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    render(
      <MemoryRouter initialEntries={['/templates']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Анонс занятия' }),
    ).toBeInTheDocument();
  });

  it('admin на /people — маршрут «Люди» открывает PeopleScreen (RequireAdmin, блокер аудита Б3)', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({});
      if (path === '/auth/me')
        return Promise.resolve({
          id: 'a1',
          name: 'Маша',
          roles: ['admin'],
          tz: 'Asia/Jerusalem',
        });
      if (path.startsWith('/users')) return Promise.resolve([]);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    render(
      <MemoryRouter initialEntries={['/people']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Здесь те, кто хотя бы раз вошёл в кабинет через Telegram/),
    ).toBeInTheDocument();
  });

  it('учитель без admin на /people — уводит на «Сводку», не «Люди»', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({});
      if (path === '/auth/me')
        return Promise.resolve({
          id: 'u1',
          name: 'Дима',
          roles: ['teacher'],
          tz: 'Asia/Jerusalem',
        });
      if (path.startsWith('/summary'))
        return Promise.resolve({
          period: { from: '2026-08-08T00:00:00Z', to: '2026-09-07T00:00:00Z' },
          broadcastsSent: 0,
          broadcastsCancelled: 0,
          deliveriesFailed: 0,
          deliveriesPending: 0,
          manualWaiting: 0,
          emptyMessage: 'Пока нечего показать.',
        });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    render(
      <MemoryRouter initialEntries={['/people']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Пока нечего показать.')).toBeInTheDocument();
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
