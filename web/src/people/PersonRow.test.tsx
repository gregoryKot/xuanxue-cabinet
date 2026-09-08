import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { UserDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { PersonRow } from './PersonRow';

function makePerson(overrides: Partial<UserDto> = {}): UserDto {
  return {
    id: 'u1',
    name: 'Гриша',
    roles: [],
    status: 'active',
    hasTelegram: true,
    lastLoginAt: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

function renderRow(
  overrides: Partial<UserDto> = {},
  isSelf = false,
  onChangeRoles: (roles: UserDto['roles']) => Promise<void> = vi
    .fn()
    .mockResolvedValue(undefined),
) {
  render(
    <ul>
      <PersonRow
        person={makePerson(overrides)}
        isSelf={isSelf}
        onChangeRoles={onChangeRoles}
      />
    </ul>,
  );
  return { onChangeRoles };
}

describe('PersonRow', () => {
  it('имя и дата входа', () => {
    renderRow();
    expect(screen.getByText('Гриша')).toBeInTheDocument();
    expect(screen.getByText(/^Вход/)).toBeInTheDocument();
  });

  it('без lastLoginAt — «Ещё не входил»', () => {
    renderRow({ lastLoginAt: undefined });
    expect(screen.getByText('Ещё не входил')).toBeInTheDocument();
  });

  it('status: blocked — рядом с датой видна подпись «Доступ закрыт»', () => {
    renderRow({ status: 'blocked' });
    expect(screen.getByText(/Доступ закрыт/)).toBeInTheDocument();
  });

  it('status: active — подписи «Доступ закрыт» нет', () => {
    renderRow({ status: 'active' });
    expect(screen.queryByText(/Доступ закрыт/)).not.toBeInTheDocument();
  });

  it('включить «Учитель» — зовёт onChangeRoles с добавленной ролью', async () => {
    const user = userEvent.setup();
    const { onChangeRoles } = renderRow({ roles: [] });

    await user.click(screen.getByLabelText('Учитель — Гриша'));
    expect(onChangeRoles).toHaveBeenCalledWith(['teacher']);
  });

  it('выключить «Администратор» — роль убрана из списка, остальные сохранены', async () => {
    const user = userEvent.setup();
    const { onChangeRoles } = renderRow({ roles: ['teacher', 'admin'] });

    await user.click(screen.getByLabelText('Администратор — Гриша'));
    expect(onChangeRoles).toHaveBeenCalledWith(['teacher']);
  });

  it('свой профиль — переключатель admin выключен, подсказка видна', () => {
    renderRow({ roles: ['admin'] }, true);
    expect(screen.getByLabelText('Администратор — Гриша')).toBeDisabled();
    expect(
      screen.getByText('Роль администратора у себя снимает другой администратор'),
    ).toBeInTheDocument();
  });

  it('сбой PATCH — alert с текстом ошибки', async () => {
    const user = userEvent.setup();
    const onChangeRoles = vi
      .fn()
      .mockRejectedValue(new ApiError('Пользователь не найден.', 404, 'not_found'));
    renderRow({ roles: [] }, false, onChangeRoles);

    await user.click(screen.getByLabelText('Учитель — Гриша'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Пользователь не найден.');
  });

  it('сбой не из API (сеть) — общий текст, а не пустой alert', async () => {
    const user = userEvent.setup();
    const onChangeRoles = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    renderRow({ roles: [] }, false, onChangeRoles);

    await user.click(screen.getByLabelText('Учитель — Гриша'));

    expect(await screen.findByRole('alert')).not.toHaveTextContent('Failed to fetch');
  });

  it('во время PATCH оба переключателя недоступны (pending)', async () => {
    const user = userEvent.setup();
    let resolveChange: () => void = () => {};
    const onChangeRoles = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveChange = resolve;
        }),
    );
    renderRow({ roles: [] }, false, onChangeRoles);

    await user.click(screen.getByLabelText('Учитель — Гриша'));
    expect(screen.getByLabelText('Администратор — Гриша')).toBeDisabled();

    resolveChange();
    await waitFor(() =>
      expect(screen.getByLabelText('Администратор — Гриша')).not.toBeDisabled(),
    );
  });
});
