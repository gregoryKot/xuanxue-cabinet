// Плашка «Вы в режиме ученика» (ADR-0163): видна только в режиме, выход одной
// кнопкой, с клавиатуры, ошибка не прячется. В оболочке на каждом экране —
// StudentModeFlow.test.tsx.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import {
  STAFF_IN_STUDENT_MODE_ME,
  STAFF_ME,
  STUDENT_ME,
} from '../test-support/meFixture';
import { StudentModeBanner } from './StudentModeBanner';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

// Пробники: адрес и «профиль уже пришёл» — без второго нечего ждать там, где
// плашки нет вовсе.
function Probes() {
  const { me } = useAuth();
  return (
    <>
      <p data-testid="path">{useLocation().pathname}</p>
      <p data-testid="loaded">{me ? me.name : 'ждём профиль'}</p>
    </>
  );
}

function renderBanner(me: MeDto, handlers: Record<string, unknown> = {}) {
  mockApiByPath({ '/auth/me': me, ...handlers });
  return render(
    <MemoryRouter initialEntries={['/lessons']}>
      <AuthProvider>
        <StudentModeBanner />
        <Probes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('StudentModeBanner — когда видна', () => {
  it('в режиме ученика — статус с текстом и кнопкой «Вернуться к роли»', async () => {
    renderBanner(STAFF_IN_STUDENT_MODE_ME);

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Вы в режиме ученика');
    expect(screen.getByRole('button', { name: 'Вернуться к роли' })).toBeInTheDocument();
  });

  it.each([
    ['штат без режима', STAFF_ME],
    ['настоящий ученик', STUDENT_ME],
  ])('%s — плашки нет', async (_label, me) => {
    renderBanner(me);

    await waitFor(() => expect(screen.getByTestId('loaded')).toHaveTextContent(me.name));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Вернуться к роли' }),
    ).not.toBeInTheDocument();
  });
});

describe('StudentModeBanner — выход из режима', () => {
  it('кнопка шлёт PUT { enabled: false }, плашка пропадает, человек на «Доске»', async () => {
    const user = userEvent.setup();
    renderBanner(STAFF_IN_STUDENT_MODE_ME, { '/me/student-mode': STAFF_ME });

    await user.click(await screen.findByRole('button', { name: 'Вернуться к роли' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/me/student-mode', {
        method: 'PUT',
        body: { enabled: false },
      }),
    );
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByTestId('path')).toHaveTextContent('/board');
  });

  it('с клавиатуры: Tab доходит до кнопки, Enter выходит из режима', async () => {
    const user = userEvent.setup();
    renderBanner(STAFF_IN_STUDENT_MODE_ME, { '/me/student-mode': STAFF_ME });
    const button = await screen.findByRole('button', { name: 'Вернуться к роли' });

    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/me/student-mode', {
        method: 'PUT',
        body: { enabled: false },
      }),
    );
  });

  it('цель нажатия — не меньше 44 px', async () => {
    renderBanner(STAFF_IN_STUDENT_MODE_ME);

    const button = await screen.findByRole('button', { name: 'Вернуться к роли' });
    expect(button.style.minHeight).toBe('44px');
  });

  it('сбой — текст ошибки рядом, плашка остаётся, кнопка снова доступна', async () => {
    const user = userEvent.setup();
    renderBanner(STAFF_IN_STUDENT_MODE_ME, {
      '/me/student-mode': new ApiError(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
        0,
        'network',
      ),
    });

    const button = await screen.findByRole('button', { name: 'Вернуться к роли' });
    await user.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(screen.getByTestId('path')).toHaveTextContent('/lessons');
  });
});
