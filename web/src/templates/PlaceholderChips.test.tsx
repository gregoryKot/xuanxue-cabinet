import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TEMPLATE_PLACEHOLDERS } from '@xuanxue/shared';
import { PLACEHOLDER_HINTS } from './placeholderHints';
import { PlaceholderChips } from './PlaceholderChips';

describe('PlaceholderChips', () => {
  it('чип — настоящая кнопка, клик вызывает onInsert с именем подстановки', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    render(<PlaceholderChips onInsert={onInsert} />);

    const chip = screen.getByRole('button', { name: '{ссылка}' });
    await user.click(chip);

    expect(onInsert).toHaveBeenCalledWith('ссылка');
  });

  it('работает с клавиатуры — Tab доводит фокус, Enter вставляет', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    render(<PlaceholderChips onInsert={onInsert} />);

    await user.tab();
    expect(screen.getByRole('button', { name: '{название}' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onInsert).toHaveBeenCalledWith('название');
  });

  // Список, а не подсказка по наведению: на телефоне её не увидеть, не
  // нажав чип, а нажатие уже вставляет подстановку в текст.
  it('пояснения доступны списком, без нажатия на чип', async () => {
    const user = userEvent.setup();
    render(<PlaceholderChips onInsert={vi.fn()} />);

    await user.click(screen.getByText('Что подставится в пост'));

    for (const name of TEMPLATE_PLACEHOLDERS) {
      expect(screen.getByText(PLACEHOLDER_HINTS[name])).toBeInTheDocument();
    }
  });
});
