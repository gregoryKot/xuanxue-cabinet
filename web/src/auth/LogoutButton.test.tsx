// Кнопка выхода — один компонент на «Настройки» и экран ученика, поэтому её
// разметка (в том числе `role="alert"` с текстом ошибки) проверяется здесь, а
// не копией в тесте каждого экрана.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { AuthProvider } from './AuthProvider';
import { LogoutButton } from './LogoutButton';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function renderButton() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <AuthProvider>
        <LogoutButton />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LogoutButton', () => {
  it('без ошибки — только кнопка', () => {
    mockedApiFetch.mockResolvedValue(undefined);

    renderButton();

    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('выход не удался — текст ошибки рядом с кнопкой', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) =>
      path === '/auth/logout'
        ? Promise.reject(new Error('network down'))
        : Promise.resolve({}),
    );

    renderButton();
    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выйти');
  });
});
