import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScreenActions } from './ScreenActions';

describe('ScreenActions', () => {
  it('кнопки идут в заданном порядке, каждая вызывает своё действие', async () => {
    const user = userEvent.setup();
    const onFirst = vi.fn();
    const onSecond = vi.fn();
    render(
      <ScreenActions
        actions={[
          { label: 'Каналы', onClick: onFirst },
          { label: 'Новая рассылка', onClick: onSecond, variant: 'primary' },
        ]}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Каналы',
      'Новая рассылка',
    ]);

    await user.click(screen.getByRole('button', { name: 'Каналы' }));
    expect(onFirst).toHaveBeenCalledTimes(1);
    expect(onSecond).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Новая рассылка' }));
    expect(onSecond).toHaveBeenCalledTimes(1);
  });

  it('без variant кнопка вторичная: заливки терракотой нет, у основной она есть', () => {
    render(
      <ScreenActions
        actions={[
          { label: 'Шаблоны', onClick: vi.fn() },
          { label: 'Разовое занятие', onClick: vi.fn(), variant: 'primary' },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Шаблоны' })).toHaveStyle({
      background: 'transparent',
    });
    expect(screen.getByRole('button', { name: 'Разовое занятие' })).not.toHaveStyle({
      background: 'transparent',
    });
  });
});
