// Форма имени внутри «Профиля» в изоляции (тот же приём, что
// useProfileSetup.test.ts): apiFetch замокан, `applyMe()` — обычный колбэк,
// <AuthProvider> не нужен. Начальные поля из me.name и переход после
// сохранения на /welcome проверяют WelcomeScreen.test.tsx и
// profile/ProfileScreen.test.tsx — здесь только то, что специфично для
// «Профиля»: доступность кнопки и что сохранение не уводит с экрана.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { ProfileNameSection } from './ProfileNameSection';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

// Ответ PATCH /me/profile (ADR-0087) — applyMe() получает его напрямую,
// второго GET /auth/me тест не ждёт.
const ME: MeDto = {
  id: 'u1',
  name: 'Дмитрий Котова',
  roles: [],
  status: 'active',
  telegramLinked: true,
  botChatActive: false,
  hasEmail: false,
  noTelegram: false,
  needsProfile: false,
};

afterEach(() => {
  mockedApiFetch.mockReset();
});

function renderSection(initialName = 'Дмитрий Котов') {
  const applyMe = vi.fn();
  return {
    applyMe,
    ...render(<ProfileNameSection initialName={initialName} applyMe={applyMe} />),
  };
}

describe('ProfileNameSection — кнопка «Сохранить имя»', () => {
  it('недоступна, пока ничего не изменилось', async () => {
    renderSection();

    expect(await screen.findByRole('button', { name: 'Сохранить имя' })).toBeDisabled();
  });

  it('недоступна при пустом имени', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.clear(await screen.findByLabelText('Имя'));

    expect(screen.getByRole('button', { name: 'Сохранить имя' })).toBeDisabled();
  });

  it('доступна, когда имя изменили', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.type(await screen.findByLabelText('Фамилия'), 'а');

    expect(screen.getByRole('button', { name: 'Сохранить имя' })).toBeEnabled();
  });
});

describe('ProfileNameSection — сохранение', () => {
  it('успех — PATCH /me/profile, «Имя сохранено», форма остаётся на месте', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue(ME);
    const { applyMe } = renderSection();

    await user.type(await screen.findByLabelText('Фамилия'), 'а');
    await user.click(screen.getByRole('button', { name: 'Сохранить имя' }));

    expect(await screen.findByText('Имя сохранено')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith('/me/profile', {
      method: 'PATCH',
      body: { firstName: 'Дмитрий', lastName: 'Котова' },
    });
    expect(applyMe).toHaveBeenCalledWith(ME);
    // Форма никуда не уводит — поле со значением всё ещё на экране.
    expect(screen.getByLabelText('Имя')).toHaveValue('Дмитрий');
  });

  it('повторное изменение поля прячет «Имя сохранено» — сообщение устарело', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue(ME);
    renderSection();

    await user.type(await screen.findByLabelText('Фамилия'), 'а');
    await user.click(screen.getByRole('button', { name: 'Сохранить имя' }));
    await screen.findByText('Имя сохранено');

    await user.type(screen.getByLabelText('Фамилия'), 'а');

    expect(screen.queryByText('Имя сохранено')).not.toBeInTheDocument();
  });

  it('ошибка сервера — текст ошибки под полями, кнопка остаётся доступной для повтора', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockRejectedValue(
      new ApiError('Сервер не ответил. Попробуйте ещё раз.', 500, 'unknown'),
    );
    renderSection();

    await user.type(await screen.findByLabelText('Фамилия'), 'а');
    await user.click(screen.getByRole('button', { name: 'Сохранить имя' }));

    expect(
      await screen.findByText('Сервер не ответил. Попробуйте ещё раз.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить имя' })).toBeEnabled();
  });
});
