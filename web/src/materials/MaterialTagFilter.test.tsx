// Пилюли фильтра по тегу — обвязка над ListFilters.tsx (ADR-0058), общая для
// учителя и ученика. По образцу components/ListFilters.test.tsx.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MaterialTagFilter } from './MaterialTagFilter';

describe('MaterialTagFilter', () => {
  it('тегов нет — строка фильтров не рисуется вовсе', () => {
    const { container } = render(
      <MaterialTagFilter tags={[]} value="" onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('пилюля на каждый тег плюс «Все», группа подписана «Теги»', () => {
    render(<MaterialTagFilter tags={['старшая', 'база']} value="" onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Теги' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Все' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'старшая' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'база' })).toBeInTheDocument();
  });

  it('клик по тегу вызывает onChange с этим тегом', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialTagFilter tags={['старшая', 'база']} value="" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'старшая' }));

    expect(onChange).toHaveBeenCalledWith('старшая');
  });

  it('текущий тег помечен нажатым, повторный клик по «Все» сбрасывает', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MaterialTagFilter
        tags={['старшая', 'база']}
        value="старшая"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('button', { name: 'старшая' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Все' }));

    expect(onChange).toHaveBeenCalledWith('');
  });
});
