// Обёртка тонкая (CLAUDE.md «Чистый JSX и стили — нет теста»), но передача
// значения в onChange — небольшая логика (e.target.value), и обе формы
// (EmailLoginForm.tsx, auth/EmailLinkForm.tsx) полагаются на неё одинаково.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmailField } from './EmailField';

describe('EmailField', () => {
  it('подпись «Почта», значение и ввод передаются через onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EmailField value="a@example.com" onChange={onChange} />);

    const input = screen.getByLabelText('Почта');
    expect(input).toHaveValue('a@example.com');
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toBeRequired();

    await user.type(input, 'x');

    expect(onChange).toHaveBeenLastCalledWith('a@example.comx');
  });
});
