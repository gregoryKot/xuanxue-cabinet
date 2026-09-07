import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Toggle } from './Toggle';

describe('Toggle', () => {
  it('отражает checked и находится по подписи', () => {
    render(<Toggle label="Занятие активно" checked onChange={vi.fn()} />);
    expect(screen.getByLabelText('Занятие активно')).toBeChecked();
  });

  it('клик вызывает onChange с противоположным значением', async () => {
    const onChange = vi.fn();
    render(<Toggle label="Занятие активно" checked={false} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('Занятие активно'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('disabled — переключатель недоступен, клик не вызывает onChange', async () => {
    const onChange = vi.fn();
    render(<Toggle label="Включён" checked={false} disabled onChange={onChange} />);

    expect(screen.getByLabelText('Включён')).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Включён'));

    expect(onChange).not.toHaveBeenCalled();
  });
});
