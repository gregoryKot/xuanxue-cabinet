// MemoryRouter — ConfirmDialog внутри строки держит useHistorySheet
// (react-router), как в BroadcastCard.test.tsx.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ROLE_LABELS, USER_ROLES, type UserDto } from '@xuanxue/shared';
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
    joinedViaInvite: false,
    ...overrides,
  };
}

function renderRow(
  overrides: Partial<UserDto> = {},
  isSelf = false,
  onChangeRoles: (roles: UserDto['roles']) => Promise<void> = vi
    .fn()
    .mockResolvedValue(undefined),
  onRemove: () => Promise<void> = vi.fn().mockResolvedValue(undefined),
  onChangeStatus: (status: UserDto['status']) => Promise<void> = vi
    .fn()
    .mockResolvedValue(undefined),
) {
  render(
    <MemoryRouter initialEntries={['/hub', '/people']} initialIndex={1}>
      <ul>
        <PersonRow
          person={makePerson(overrides)}
          isSelf={isSelf}
          onChangeRoles={onChangeRoles}
          onChangeStatus={onChangeStatus}
          onRemove={onRemove}
        />
      </ul>
    </MemoryRouter>,
  );
  return { onChangeRoles, onRemove, onChangeStatus };
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
    expect(screen.getByText('Доступ закрыт')).toBeInTheDocument();
  });

  it('status: active — подписи «Доступ закрыт» нет', () => {
    renderRow({ status: 'active' });
    expect(screen.queryByText('Доступ закрыт')).not.toBeInTheDocument();
  });

  it('включить «Учитель» — зовёт onChangeRoles с добавленной ролью', async () => {
    const user = userEvent.setup();
    const { onChangeRoles } = renderRow({ roles: [] });

    await user.click(screen.getByLabelText('Учитель'));
    expect(onChangeRoles).toHaveBeenCalledWith(['teacher']);
  });

  it('выключить «Администратор» — роль убрана из списка, остальные сохранены', async () => {
    const user = userEvent.setup();
    const { onChangeRoles } = renderRow({ roles: ['teacher', 'admin'] });

    await user.click(screen.getByLabelText('Администратор'));
    expect(onChangeRoles).toHaveBeenCalledWith(['teacher']);
  });

  it('переключатель на каждую роль из USER_ROLES, подпись — из ROLE_LABELS', () => {
    renderRow();
    expect(USER_ROLES).toHaveLength(4);
    for (const role of USER_ROLES) {
      expect(screen.getByLabelText(ROLE_LABELS[role])).toBeInTheDocument();
    }
  });

  // ADR-0031: подпись переключателя — только роль, иначе «Администратор —
  // Игорь Семёнов» повторяет имя четыре раза в одной строке. Имя осталось
  // именем группы: скринридер называет его, входя в переключатели.
  it('имя человека не повторяется в подписях ролей, а стоит в названии группы', () => {
    renderRow();
    const roles = screen.getByRole('group', { name: 'Роли — Гриша' });
    expect(within(roles).getByLabelText('Администратор')).toBeInTheDocument();
    expect(screen.queryByLabelText('Администратор — Гриша')).not.toBeInTheDocument();
  });

  it('без ролей — подсказка «человек — ученик»', () => {
    renderRow({ roles: [] });
    expect(screen.getByText(/человек — ученик/)).toBeInTheDocument();
  });

  it('с ролью (например, учитель) — подсказки «человек — ученик» нет', () => {
    renderRow({ roles: ['teacher'] });
    expect(screen.queryByText(/человек — ученик/)).not.toBeInTheDocument();
  });

  it('включить «Помощник учителя» — зовёт onChangeRoles с добавленной ролью', async () => {
    const user = userEvent.setup();
    const { onChangeRoles } = renderRow({ roles: [] });

    await user.click(screen.getByLabelText('Помощник учителя'));
    expect(onChangeRoles).toHaveBeenCalledWith(['assistant']);
  });

  it('включить «Бухгалтер» — зовёт onChangeRoles с добавленной ролью', async () => {
    const user = userEvent.setup();
    const { onChangeRoles } = renderRow({ roles: [] });

    await user.click(screen.getByLabelText('Бухгалтер'));
    expect(onChangeRoles).toHaveBeenCalledWith(['accountant']);
  });

  it('свой профиль — переключатель admin выключен, подсказка видна', () => {
    renderRow({ roles: ['admin'] }, true);
    expect(screen.getByLabelText('Администратор')).toBeDisabled();
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

    await user.click(screen.getByLabelText('Учитель'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Пользователь не найден.');
  });

  it('сбой не из API (сеть) — общий текст, а не пустой alert', async () => {
    const user = userEvent.setup();
    const onChangeRoles = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    renderRow({ roles: [] }, false, onChangeRoles);

    await user.click(screen.getByLabelText('Учитель'));

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

    await user.click(screen.getByLabelText('Учитель'));
    expect(screen.getByLabelText('Администратор')).toBeDisabled();

    resolveChange();
    await waitFor(() =>
      expect(screen.getByLabelText('Администратор')).not.toBeDisabled(),
    );
  });

  it('«Удалить данные» есть у чужой строки', () => {
    renderRow({ roles: [] }, false);
    expect(screen.getByRole('button', { name: 'Удалить данные' })).toBeInTheDocument();
  });

  it('«Удалить данные» нет у своей строки — себя не удалить', () => {
    renderRow({ roles: ['admin'] }, true);
    expect(
      screen.queryByRole('button', { name: 'Удалить данные' }),
    ).not.toBeInTheDocument();
  });

  it('клик по «Удалить данные» открывает подтверждение, «Удалить данные» в диалоге зовёт onRemove', async () => {
    const user = userEvent.setup();
    const { onRemove } = renderRow({ roles: [] });

    await user.click(screen.getByRole('button', { name: 'Удалить данные' }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить данные?' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/Аккаунт и вход в кабинет пропадут/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Удалить данные' }));

    expect(onRemove).toHaveBeenCalled();
  });

  it('отмена в диалоге — onRemove не вызван', async () => {
    const user = userEvent.setup();
    const { onRemove } = renderRow({ roles: [] });

    await user.click(screen.getByRole('button', { name: 'Удалить данные' }));
    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('сбой удаления — alert с текстом ошибки', async () => {
    const user = userEvent.setup();
    const onRemove = vi
      .fn()
      .mockRejectedValue(new ApiError('Свой аккаунт удалить нельзя.', 403, 'forbidden'));
    renderRow({ roles: [] }, false, undefined, onRemove);

    await user.click(screen.getByRole('button', { name: 'Удалить данные' }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить данные?' });
    await user.click(within(dialog).getByRole('button', { name: 'Удалить данные' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Свой аккаунт удалить нельзя.',
    );
  });

  // Статуса «ждёт подтверждения» больше нет (ADR-0036) — регрессия на
  // инцидент 2026-09-15: подпись и кнопка «Подтвердить» не должны
  // появляться ни при каком статусе.
  it('нет подписи «Ждёт подтверждения» и кнопки «Подтвердить» ни при каком статусе', () => {
    renderRow({ status: 'active' });
    expect(screen.queryByText(/Ждёт подтверждения/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Подтвердить' })).not.toBeInTheDocument();
  });

  // Блокировка (ADR-0036, RUNBOOK §8.15): active — «Закрыть доступ»,
  // blocked — «Открыть доступ», у своей строки нет ни того ни другого.
  it('status: active — кнопка «Закрыть доступ» у чужой строки', () => {
    renderRow({ status: 'active' }, false);
    expect(screen.getByRole('button', { name: 'Закрыть доступ' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Открыть доступ' }),
    ).not.toBeInTheDocument();
  });

  it('status: blocked — кнопка «Открыть доступ» у чужой строки', () => {
    renderRow({ status: 'blocked' }, false);
    expect(screen.getByRole('button', { name: 'Открыть доступ' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Закрыть доступ' }),
    ).not.toBeInTheDocument();
  });

  it('своя строка — ни «Закрыть доступ», ни «Открыть доступ»', () => {
    renderRow({ status: 'active', roles: ['admin'] }, true);
    expect(
      screen.queryByRole('button', { name: 'Закрыть доступ' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Открыть доступ' }),
    ).not.toBeInTheDocument();
  });

  it("клик «Закрыть доступ» зовёт onChangeStatus('blocked')", async () => {
    const user = userEvent.setup();
    const { onChangeStatus } = renderRow({ status: 'active' });

    await user.click(screen.getByRole('button', { name: 'Закрыть доступ' }));

    expect(onChangeStatus).toHaveBeenCalledWith('blocked');
  });

  it("клик «Открыть доступ» зовёт onChangeStatus('active')", async () => {
    const user = userEvent.setup();
    const { onChangeStatus } = renderRow({ status: 'blocked' });

    await user.click(screen.getByRole('button', { name: 'Открыть доступ' }));

    expect(onChangeStatus).toHaveBeenCalledWith('active');
  });

  it('сбой смены доступа — alert с текстом ApiError', async () => {
    const user = userEvent.setup();
    const onChangeStatus = vi
      .fn()
      .mockRejectedValue(new ApiError('Свой доступ закрыть нельзя.', 403, 'forbidden'));
    renderRow({ status: 'active' }, false, undefined, undefined, onChangeStatus);

    await user.click(screen.getByRole('button', { name: 'Закрыть доступ' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Свой доступ закрыть нельзя.',
    );
  });
});
