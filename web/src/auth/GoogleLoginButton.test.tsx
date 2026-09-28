// Клик уводит вкладку (redirectToGoogleAuth) — замокан, как в
// telegramAuthRedirect у LoginScreen.test.tsx: настоящий window.location.assign
// увёл бы jsdom со страницы.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as GoogleAuthRedirectModule from './googleAuthRedirect';
import { redirectToGoogleAuth } from './googleAuthRedirect';
import { GoogleLoginButton } from './GoogleLoginButton';

vi.mock('./googleAuthRedirect', async () => {
  const actual =
    await vi.importActual<typeof GoogleAuthRedirectModule>('./googleAuthRedirect');
  return { ...actual, redirectToGoogleAuth: vi.fn() };
});

const redirectSpy = vi.mocked(redirectToGoogleAuth);

afterEach(() => {
  redirectSpy.mockClear();
});

describe('GoogleLoginButton', () => {
  it('рисует кнопку «Войти через Google»', () => {
    render(<GoogleLoginButton />);
    expect(
      screen.getByRole('button', { name: 'Войти через Google' }),
    ).toBeInTheDocument();
  });

  it('клик без кода приглашения уводит вкладку и занимает кнопку', async () => {
    const user = userEvent.setup();
    render(<GoogleLoginButton />);

    const button = screen.getByRole('button', { name: 'Войти через Google' });
    await user.click(button);

    expect(redirectSpy).toHaveBeenCalledWith(undefined);
    expect(redirectSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toBeDisabled());
  });

  it('клик с кодом приглашения передаёт его в редирект', async () => {
    const user = userEvent.setup();
    const code = 'a'.repeat(32);
    render(<GoogleLoginButton inviteCode={code} />);

    await user.click(screen.getByRole('button', { name: 'Войти через Google' }));

    expect(redirectSpy).toHaveBeenCalledWith(code);
  });
});
