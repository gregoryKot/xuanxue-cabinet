import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StatusActionButtons, type StatusAction } from './StatusActionButtons';

type FakeStatus = 'a' | 'b';

const ACTIONS: StatusAction<FakeStatus>[] = [{ label: 'В Б', nextStatus: 'b' }];

describe('StatusActionButtons', () => {
  it('показывает подпись статуса и кнопки переходов', () => {
    render(
      <StatusActionButtons
        statusLabel="Статус А"
        pending={false}
        actions={ACTIONS}
        onChangeStatus={vi.fn()}
      />,
    );

    expect(screen.getByText('Статус: Статус А')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'В Б' })).toBeInTheDocument();
  });

  it('клик по переходу зовёт onChangeStatus с nextStatus', async () => {
    const user = userEvent.setup();
    const onChangeStatus = vi.fn();
    render(
      <StatusActionButtons
        statusLabel="Статус А"
        pending={false}
        actions={ACTIONS}
        onChangeStatus={onChangeStatus}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'В Б' }));

    expect(onChangeStatus).toHaveBeenCalledWith('b');
  });

  it('onRemove передан — кнопка «Удалить» есть, explanation не показывается', () => {
    render(
      <StatusActionButtons
        statusLabel="Статус А"
        pending={false}
        actions={ACTIONS}
        onChangeStatus={vi.fn()}
        onRemove={vi.fn()}
        explanation="Почему нельзя"
      />,
    );

    expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
    expect(screen.queryByText('Почему нельзя')).not.toBeInTheDocument();
  });

  it('onRemove не передан — кнопки «Удалить» нет, explanation показывается', () => {
    render(
      <StatusActionButtons
        statusLabel="Статус А"
        pending={false}
        actions={ACTIONS}
        onChangeStatus={vi.fn()}
        explanation="Почему нельзя"
      />,
    );

    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
    expect(screen.getByText('Почему нельзя')).toBeInTheDocument();
  });

  it('клик по «Удалить» зовёт onRemove', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <StatusActionButtons
        statusLabel="Статус А"
        pending={false}
        actions={ACTIONS}
        onChangeStatus={vi.fn()}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
