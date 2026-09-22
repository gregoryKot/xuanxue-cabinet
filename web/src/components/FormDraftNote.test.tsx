// Строка о восстановленном черновике — видима только при restored, кнопка
// «Убрать черновик» зовёт onDiscard, role="alert" здесь нет намеренно (не
// ошибка — scrollToFirstAlert не должен на неё реагировать).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FormDraftNote } from './FormDraftNote';

describe('FormDraftNote', () => {
  it('restored === false — ничего не рендерит', () => {
    const { container } = render(<FormDraftNote restored={false} onDiscard={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('restored === true — текст черновика и кнопка, без role="alert"', () => {
    render(<FormDraftNote restored onDiscard={vi.fn()} />);

    expect(screen.getByText(/набрали в прошлый раз/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Убрать черновик' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('клик «Убрать черновик» зовёт onDiscard', async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    render(<FormDraftNote restored onDiscard={onDiscard} />);

    await user.click(screen.getByRole('button', { name: 'Убрать черновик' }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
