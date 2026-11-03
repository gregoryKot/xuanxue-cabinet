// Плашка «Вы в режиме ученика» / «Вы в режиме учителя» (ADR-0163, ADR-0190): видна
// только в режиме, выход одной кнопкой, с клавиатуры, ошибка не прячется. В
// оболочке на каждом экране — StudentModeFlow.test.tsx и TeacherModeFlow.test.tsx.
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
  ADMIN_IN_TEACHER_MODE_ME,
  ADMIN_ME,
  STAFF_IN_STUDENT_MODE_ME,
  STAFF_ME,
  STUDENT_ME,
} from '../test-support/meFixture';
import { ActingModeBanner } from './ActingModeBanner';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const BACK_BUTTON = 'Вернуться к роли';

const IN_MODE = [
  {
    label: 'ученика',
    message: 'Вы в режиме ученика',
    path: '/me/student-mode',
    inMode: STAFF_IN_STUDENT_MODE_ME,
    after: STAFF_ME,
  },
  {
    label: 'учителя',
    message: 'Вы в режиме учителя',
    path: '/me/teacher-mode',
    inMode: ADMIN_IN_TEACHER_MODE_ME,
    after: ADMIN_ME,
  },
];

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
        <ActingModeBanner />
        <Probes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('ActingModeBanner — когда видна', () => {
  it.each(IN_MODE)(
    'в режиме $label — статус с текстом и кнопкой «Вернуться к роли»',
    async ({ message, inMode }) => {
      renderBanner(inMode);

      const status = await screen.findByRole('status');
      expect(status).toHaveTextContent(message);
      expect(screen.getByRole('button', { name: BACK_BUTTON })).toBeInTheDocument();
    },
  );

  it.each([
    ['штат без режима', STAFF_ME],
    ['разработчик без режима', ADMIN_ME],
    ['настоящий ученик', STUDENT_ME],
  ])('%s — плашки нет', async (_label, me) => {
    renderBanner(me);

    await waitFor(() => expect(screen.getByTestId('loaded')).toHaveTextContent(me.name));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: BACK_BUTTON })).not.toBeInTheDocument();
  });

  it('оба флага разом (правка в базе) — плашка одна, режима ученика: он уже', async () => {
    renderBanner({ ...ADMIN_IN_TEACHER_MODE_ME, roles: [], studentMode: true });

    expect(await screen.findByRole('status')).toHaveTextContent('Вы в режиме ученика');
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});

describe.each(IN_MODE)('ActingModeBanner — выход из режима $label', (c) => {
  it('кнопка шлёт PUT { enabled: false } на свой маршрут, плашка пропадает, человек на «Главной»', async () => {
    const user = userEvent.setup();
    renderBanner(c.inMode, { [c.path]: c.after });

    await user.click(await screen.findByRole('button', { name: BACK_BUTTON }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(c.path, {
        method: 'PUT',
        body: { enabled: false },
      }),
    );
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByTestId('path')).toHaveTextContent('/board');
  });

  it('с клавиатуры: Tab доходит до кнопки, Enter выходит из режима', async () => {
    const user = userEvent.setup();
    renderBanner(c.inMode, { [c.path]: c.after });
    const button = await screen.findByRole('button', { name: BACK_BUTTON });

    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(c.path, {
        method: 'PUT',
        body: { enabled: false },
      }),
    );
  });

  it('цель нажатия — не меньше 44 px', async () => {
    renderBanner(c.inMode);

    const button = await screen.findByRole('button', { name: BACK_BUTTON });
    expect(button.style.minHeight).toBe('44px');
  });

  it('сбой — текст ошибки рядом, плашка остаётся, кнопка снова доступна', async () => {
    const user = userEvent.setup();
    renderBanner(c.inMode, {
      [c.path]: new ApiError(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
        0,
        'network',
      ),
    });

    const button = await screen.findByRole('button', { name: BACK_BUTTON });
    await user.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(screen.getByTestId('path')).toHaveTextContent('/lessons');
  });
});
