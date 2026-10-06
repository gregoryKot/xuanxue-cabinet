// Секция «Режим ученика» в «Профиле» (ADR-0163): текст до кнопки, запрос,
// read-after-write через applyMe (без второго GET /auth/me), занятость кнопки,
// тексты ошибок и переход на первый экран новой роли. Сама оболочка и меню —
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
import { STAFF_IN_STUDENT_MODE_ME, STAFF_ME } from '../test-support/meFixture';
import { StudentModeSection } from './StudentModeSection';
import { STUDENT_MODE_SWITCH_FAILED_MESSAGE } from './useStudentMode';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

// Секция берёт `me` пропом, как в ProfileScreen; обёртка отдаёт ей то, что
// лежит в AuthProvider, чтобы после applyMe() подпись кнопки перерисовалась.
function Harness() {
  const { me } = useAuth();
  const { pathname } = useLocation();
  return (
    <>
      {me && <StudentModeSection me={me} />}
      <p data-testid="path">{pathname}</p>
    </>
  );
}

function renderSection(me: MeDto, handlers: Record<string, unknown> = {}) {
  mockApiByPath({ '/auth/me': me, ...handlers });
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <AuthProvider>
        <Harness />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function callsTo(path: string) {
  return mockedApiFetch.mock.calls.filter(([calledPath]) => calledPath === path);
}

describe('StudentModeSection — режим выключен', () => {
  it('объясняет до кнопки, что изменится и что останется штатным', async () => {
    renderSection(STAFF_ME);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Режим ученика' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Кабинет покажет вам экраны, меню и уведомления о занятиях/),
    ).toBeInTheDocument();
    expect(screen.getByText('Бот и оповещения о сбоях').tagName).toBe('STRONG');
    expect(
      screen.getByRole('button', { name: 'Включить режим ученика' }),
    ).toBeInTheDocument();
  });

  it('нажатие шлёт PUT { enabled: true }, подпись меняется по ответу, ведёт на «Доску»', async () => {
    const user = userEvent.setup();
    renderSection(STAFF_ME, { '/me/student-mode': STAFF_IN_STUDENT_MODE_ME });

    await user.click(
      await screen.findByRole('button', { name: 'Включить режим ученика' }),
    );

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/me/student-mode', {
        method: 'PUT',
        body: { enabled: true },
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Вернуться к своей роли' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/board');
    // Ответ записи применён как есть: второго чтения профиля нет (ADR-0087).
    expect(callsTo('/auth/me')).toHaveLength(1);
  });

  it('пока запрос идёт, кнопка занята и недоступна', async () => {
    const user = userEvent.setup();
    renderSection(STAFF_ME);
    // Ответа на PUT нет, пока тест не закончится: так видно именно ожидание.
    mockedApiFetch.mockImplementation((path: string) =>
      path === '/auth/me' ? Promise.resolve(STAFF_ME) : new Promise(() => undefined),
    );

    const button = await screen.findByRole('button', { name: 'Включить режим ученика' });
    await user.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(callsTo('/me/student-mode')).toHaveLength(1);
  });

  it('отказ сервера — его текст в role="alert", кнопка снова доступна, переход не случился', async () => {
    const user = userEvent.setup();
    renderSection(STAFF_ME, {
      '/me/student-mode': new ApiError(
        'Режим ученика есть только у учителей, помощников и администратора.',
        403,
        'forbidden',
      ),
    });

    const button = await screen.findByRole('button', { name: 'Включить режим ученика' });
    await user.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Режим ученика есть только у учителей, помощников и администратора.',
    );
    expect(button).toBeEnabled();
    expect(screen.getByTestId('path')).toHaveTextContent('/profile');
  });

  it('сбой без ответа сервера — общий текст с действием', async () => {
    const user = userEvent.setup();
    renderSection(STAFF_ME, { '/me/student-mode': new Error('обрыв') });

    await user.click(
      await screen.findByRole('button', { name: 'Включить режим ученика' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      STUDENT_MODE_SWITCH_FAILED_MESSAGE,
    );
    expect(STUDENT_MODE_SWITCH_FAILED_MESSAGE).toBe(
      'Не удалось переключить режим. Попробуйте ещё раз.',
    );
  });
});

describe('StudentModeSection — режим включён', () => {
  it('кнопка «Вернуться к своей роли» шлёт PUT { enabled: false } и ведёт на «Доску»', async () => {
    const user = userEvent.setup();
    renderSection(STAFF_IN_STUDENT_MODE_ME, { '/me/student-mode': STAFF_ME });

    expect(await screen.findByText('Роль сохранена')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Вернуться к своей роли' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/me/student-mode', {
        method: 'PUT',
        body: { enabled: false },
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Включить режим ученика' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/board');
  });
});
