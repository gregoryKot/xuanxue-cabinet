import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('по умолчанию type="button" — не отправляет форму', () => {
    render(<Button>Сохранить</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('type можно переопределить (кнопка сабмита формы)', () => {
    render(<Button type="submit">Сохранить</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('pending — кнопка занята и недоступна для повторного клика', async () => {
    const onClick = vi.fn();
    render(
      <Button pending onClick={onClick}>
        Сохранить
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('обычный клик вызывает onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Сохранить</Button>);

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled={false} явно + pending — всё равно недоступна (не только последний флаг)', () => {
    render(
      <Button disabled={false} pending>
        Сохранить
      </Button>,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('disabled без pending — недоступна', () => {
    render(<Button disabled>Сохранить</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  // Роли различимы структурой, не только цветом (низкое зрение, ч/б печать) —
  // у первичной заливка и нет контура, у вторичной контур без заливки, у
  // опасной нет ни того, ни другого (docs/adr/0031-visual-direction-quiet-
  // and-noble.md). Проверяем факт заливки/контура по имени токена, не оттенок.
  it('заливка есть только у первичной кнопки', () => {
    render(
      <>
        <Button variant="primary">Сохранить</Button>
        <Button variant="secondary">Отмена</Button>
        <Button variant="danger">Удалить</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Сохранить' }).style.background).not.toBe(
      'transparent',
    );
    expect(screen.getByRole('button', { name: 'Отмена' }).style.background).toBe(
      'transparent',
    );
    expect(screen.getByRole('button', { name: 'Удалить' }).style.background).toBe(
      'transparent',
    );
  });

  it('видимый контур есть только у вторичной кнопки', () => {
    render(
      <>
        <Button variant="primary">Сохранить</Button>
        <Button variant="secondary">Отмена</Button>
        <Button variant="danger">Удалить</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Отмена' }).style.borderColor).toBe(
      'var(--control-border)',
    );
    expect(screen.getByRole('button', { name: 'Сохранить' }).style.borderColor).toBe(
      'transparent',
    );
    expect(screen.getByRole('button', { name: 'Удалить' }).style.borderColor).toBe(
      'transparent',
    );
  });
});
