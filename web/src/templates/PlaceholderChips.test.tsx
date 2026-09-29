import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PAYMENT_REMINDER_PLACEHOLDERS, TEMPLATE_PLACEHOLDERS } from '@xuanxue/shared';
import { PAYMENT_REMINDER_HINTS, PLACEHOLDER_HINTS } from './placeholderHints';
import { PlaceholderChips } from './PlaceholderChips';

const SUMMARY = 'Что подставится в пост';

function renderPostChips(onInsert = vi.fn()) {
  return render(
    <PlaceholderChips
      names={TEMPLATE_PLACEHOLDERS}
      hints={PLACEHOLDER_HINTS}
      summary={SUMMARY}
      onInsert={onInsert}
    />,
  );
}

describe('PlaceholderChips', () => {
  it('чип — настоящая кнопка, клик вызывает onInsert с именем подстановки', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    renderPostChips(onInsert);

    const chip = screen.getByRole('button', { name: '{ссылка}' });
    await user.click(chip);

    expect(onInsert).toHaveBeenCalledWith('ссылка');
  });

  it('работает с клавиатуры — Tab доводит фокус, Enter вставляет', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    renderPostChips(onInsert);

    await user.tab();
    expect(screen.getByRole('button', { name: '{название}' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onInsert).toHaveBeenCalledWith('название');
  });

  // Список, а не подсказка по наведению: на телефоне её не увидеть, не
  // нажав чип, а нажатие уже вставляет подстановку в текст.
  it('пояснения доступны списком, без нажатия на чип', async () => {
    const user = userEvent.setup();
    renderPostChips();

    await user.click(screen.getByText(SUMMARY));

    for (const name of TEMPLATE_PLACEHOLDERS) {
      expect(screen.getByText(PLACEHOLDER_HINTS[name])).toBeInTheDocument();
    }
  });

  it('подставки поста не показывают {имя}, а набор напоминания — только свои четыре', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    const { unmount } = renderPostChips();
    expect(screen.queryByRole('button', { name: '{имя}' })).not.toBeInTheDocument();
    unmount();

    render(
      <PlaceholderChips
        names={PAYMENT_REMINDER_PLACEHOLDERS}
        hints={PAYMENT_REMINDER_HINTS}
        summary="Что подставится в напоминание"
        onInsert={onInsert}
      />,
    );
    const chips = screen.getAllByRole('button').map((chip) => chip.textContent);
    expect(chips).toEqual(PAYMENT_REMINDER_PLACEHOLDERS.map((name) => `{${name}}`));

    await user.click(screen.getByRole('button', { name: '{сумма}' }));
    expect(onInsert).toHaveBeenCalledWith('сумма');

    await user.click(screen.getByText('Что подставится в напоминание'));
    for (const name of PAYMENT_REMINDER_PLACEHOLDERS) {
      expect(screen.getByText(PAYMENT_REMINDER_HINTS[name])).toBeInTheDocument();
    }
  });
});
