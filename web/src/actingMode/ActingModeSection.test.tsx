// Секция режима в «Профиле» (ADR-0163 — ученик, ADR-0190 — учитель): текст до
// кнопки, запрос, read-after-write через applyMe (без второго GET /auth/me),
// занятость кнопки, тексты ошибок и переход на первый экран новой роли. Один
// набор проверок на оба режима: различаются они только маршрутом и текстами.
// Сама оболочка и меню — StudentModeFlow.test.tsx и TeacherModeFlow.test.tsx.
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
} from '../test-support/meFixture';
import type { ActingMode } from './actingModes';
import { ActingModeSection } from './ActingModeSection';
import { ACTING_MODE_SWITCH_FAILED_MESSAGE } from './useActingMode';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

interface ModeCase {
  mode: ActingMode;
  path: string;
  title: string;
  /** Начало объяснения до включения. */
  offStart: RegExp;
  /** Выделенный факт в обоих объяснениях. */
  offAccent: string;
  onAccent: string;
  enable: string;
  off: MeDto;
  on: MeDto;
  forbidden: string;
}

const CASES: ModeCase[] = [
  {
    mode: 'student',
    path: '/me/student-mode',
    title: 'Режим ученика',
    offStart: /Кабинет покажет вам экраны, меню и уведомления о занятиях/,
    offAccent: 'Бот и оповещения о сбоях',
    onAccent: 'Роль сохранена',
    enable: 'Включить режим ученика',
    off: STAFF_ME,
    on: STAFF_IN_STUDENT_MODE_ME,
    forbidden: 'Режим ученика есть только у учителей, помощников и разработчика.',
  },
  {
    mode: 'teacher',
    path: '/me/teacher-mode',
    title: 'Режим учителя',
    offStart: /Кабинет покажет вам экраны и меню, как у учителя: без списка учеников/,
    offAccent: 'Бот и оповещения о сбоях',
    onAccent: 'Роль разработчика сохранена',
    enable: 'Включить режим учителя',
    off: ADMIN_ME,
    on: ADMIN_IN_TEACHER_MODE_ME,
    forbidden: 'Режим учителя есть только у разработчика. Учителю он не нужен.',
  },
];

// Секция берёт `me` пропом, как в ProfileScreen; обёртка отдаёт ей то, что
// лежит в AuthProvider, чтобы после applyMe() подпись кнопки перерисовалась.
function Harness({ mode }: { mode: ActingMode }) {
  const { me } = useAuth();
  const { pathname } = useLocation();
  return (
    <>
      {me && <ActingModeSection me={me} mode={mode} />}
      <p data-testid="path">{pathname}</p>
    </>
  );
}

function renderSection(
  mode: ActingMode,
  me: MeDto,
  handlers: Record<string, unknown> = {},
) {
  mockApiByPath({ '/auth/me': me, ...handlers });
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <AuthProvider>
        <Harness mode={mode} />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function callsTo(path: string) {
  return mockedApiFetch.mock.calls.filter(([calledPath]) => calledPath === path);
}

describe.each(CASES)('ActingModeSection — $mode, режим выключен', (c) => {
  it('объясняет до кнопки, что изменится и что останется как было', async () => {
    renderSection(c.mode, c.off);

    expect(
      await screen.findByRole('heading', { level: 2, name: c.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(c.offStart)).toBeInTheDocument();
    expect(screen.getByText(c.offAccent).tagName).toBe('STRONG');
    expect(screen.getByRole('button', { name: c.enable })).toBeInTheDocument();
  });

  it('нажатие шлёт PUT { enabled: true }, подпись меняется по ответу, ведёт на «Главную»', async () => {
    const user = userEvent.setup();
    renderSection(c.mode, c.off, { [c.path]: c.on });

    await user.click(await screen.findByRole('button', { name: c.enable }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(c.path, {
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
    renderSection(c.mode, c.off);
    // Ответа на PUT нет, пока тест не закончится: так видно именно ожидание.
    mockedApiFetch.mockImplementation((path: string) =>
      path === '/auth/me' ? Promise.resolve(c.off) : new Promise(() => undefined),
    );

    const button = await screen.findByRole('button', { name: c.enable });
    await user.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(callsTo(c.path)).toHaveLength(1);
  });

  it('отказ сервера — его текст в role="alert", кнопка снова доступна, переход не случился', async () => {
    const user = userEvent.setup();
    renderSection(c.mode, c.off, {
      [c.path]: new ApiError(c.forbidden, 403, 'forbidden'),
    });

    const button = await screen.findByRole('button', { name: c.enable });
    await user.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent(c.forbidden);
    expect(button).toBeEnabled();
    expect(screen.getByTestId('path')).toHaveTextContent('/profile');
  });

  it('сбой без ответа сервера — общий текст с действием', async () => {
    const user = userEvent.setup();
    renderSection(c.mode, c.off, { [c.path]: new Error('обрыв') });

    await user.click(await screen.findByRole('button', { name: c.enable }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      ACTING_MODE_SWITCH_FAILED_MESSAGE,
    );
    expect(ACTING_MODE_SWITCH_FAILED_MESSAGE).toBe(
      'Не удалось переключить режим. Попробуйте ещё раз.',
    );
  });
});

describe.each(CASES)('ActingModeSection — $mode, режим включён', (c) => {
  it('кнопка «Вернуться к своей роли» шлёт PUT { enabled: false } и ведёт на «Главную»', async () => {
    const user = userEvent.setup();
    renderSection(c.mode, c.on, { [c.path]: c.off });

    expect((await screen.findByText(c.onAccent)).tagName).toBe('STRONG');
    await user.click(screen.getByRole('button', { name: 'Вернуться к своей роли' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(c.path, {
        method: 'PUT',
        body: { enabled: false },
      }),
    );
    expect(await screen.findByRole('button', { name: c.enable })).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/board');
  });
});
