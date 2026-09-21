import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AttemptOptionTile } from './AttemptOptionTile';

describe('AttemptOptionTile', () => {
  it('без name — чекбокс', () => {
    render(
      <AttemptOptionTile
        label="Вправо"
        labelHidden={false}
        checked={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'Вправо' })).toBeInTheDocument();
  });

  it('с name — радио из группы', () => {
    render(
      <AttemptOptionTile
        label="Вправо"
        labelHidden={false}
        checked={false}
        name="attempt-i1"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Вправо' })).toBeInTheDocument();
  });

  it('клик по подписи вызывает onChange', async () => {
    const onChange = vi.fn();
    render(
      <AttemptOptionTile
        label="Влево"
        labelHidden={false}
        checked={false}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByText('Влево'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('клик по картинке — та же цель нажатия, вызывает onChange', async () => {
    const onChange = vi.fn();
    render(
      <AttemptOptionTile
        label="Вариант 1"
        labelHidden
        imageId="img1"
        checked={false}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByAltText('Вариант 1'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('labelHidden — контрол находится по доступному имени, подпись спрятана классом', () => {
    render(
      <AttemptOptionTile
        label="Вариант 1"
        labelHidden
        imageId="img1"
        checked={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'Вариант 1' })).toBeInTheDocument();
    expect(screen.getByText('Вариант 1')).toHaveClass('xuanxue-sr-only');
  });

  it('disabled — контрол выключен', () => {
    render(
      <AttemptOptionTile
        label="Вправо"
        labelHidden={false}
        checked={false}
        disabled
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'Вправо' })).toBeDisabled();
  });

  it('без imageId — картинка не рендерится', () => {
    render(
      <AttemptOptionTile
        label="Вправо"
        labelHidden={false}
        checked={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
