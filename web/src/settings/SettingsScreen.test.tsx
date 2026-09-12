// «Настройки» — вход во всё, что настраивается один раз. Проверяем то, из-за
// чего экран и появился: список ведёт туда, куда обещает; «Люди» видит только
// админ; выход работает отсюда (кнопка переехала из шапки AppShell).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto, UserRole } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import SettingsScreen from './SettingsScreen';
import { SETTINGS_LINKS } from './settingsLinks';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function me(roles: UserRole[]): MeDto {
  return { id: 'u1', name: 'Дима', roles, tz: 'Asia/Jerusalem' };
}

function renderSettings(roles: UserRole[]) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(me(roles));
    if (path === '/auth/config') return Promise.resolve({});
    if (path === '/auth/logout') return Promise.resolve(undefined);
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });

  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <AuthProvider>
        <Routes>
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/login" element={<p>Экран входа</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('SettingsScreen', () => {
  it('учитель видит все разделы, кроме «Людей», и каждый ведёт по своему адресу', async () => {
    renderSettings(['teacher']);
    const main = await screen.findByRole('main');

    for (const link of SETTINGS_LINKS.filter((item) => !item.adminOnly)) {
      expect(
        within(main).getByRole('link', { name: new RegExp(link.title) }),
      ).toHaveAttribute('href', link.to);
    }
    expect(screen.queryByRole('link', { name: /Люди/ })).not.toBeInTheDocument();
  });

  // «Люди» — только админу (SECURITY §2, гвард RequireAdmin): ссылка, ведущая
  // в 403, хуже отсутствующей.
  it('админ видит «Людей»', async () => {
    renderSettings(['admin']);

    expect(await screen.findByRole('link', { name: /Люди/ })).toHaveAttribute(
      'href',
      '/people',
    );
  });

  it('у каждого раздела есть пояснение, зачем туда заходить', async () => {
    renderSettings(['teacher']);
    await screen.findByRole('main');

    for (const link of SETTINGS_LINKS.filter((item) => !item.adminOnly)) {
      expect(screen.getByText(link.hint)).toBeInTheDocument();
    }
  });

  it('«Выйти» — POST /auth/logout и переход на вход', async () => {
    const user = userEvent.setup();
    renderSettings(['teacher']);
    await screen.findByRole('main');

    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
  });
});
