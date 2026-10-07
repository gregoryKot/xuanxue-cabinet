import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AddCard } from './AddCard';

describe('AddCard', () => {
  it('с onClick — кнопка: плюс скрыт от чтения, подсказка с акцентом', async () => {
    const onClick = vi.fn();
    render(
      <AddCard
        title="Добавить объявление"
        hint="Для **всех** учеников"
        onClick={onClick}
      />,
    );

    const button = screen.getByRole('button', { name: /Добавить объявление/ });
    expect(button).toHaveTextContent('Для всех учеников');
    expect(screen.getByText('всех').tagName).toBe('STRONG');

    await userEvent.setup().click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('с to — ссылка на свой адрес', async () => {
    render(
      <MemoryRouter initialEntries={['/board']}>
        <Routes>
          <Route
            path="/board"
            element={
              <AddCard title="Добавить событие" hint="Дата и место" to="/events/new" />
            }
          />
          <Route path="/events/new" element={<p>Новое событие</p>} />
        </Routes>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: /Добавить событие/ });
    expect(link).toHaveAttribute('href', '/events/new');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    await userEvent.setup().click(link);
    expect(await screen.findByText('Новое событие')).toBeInTheDocument();
  });
});
