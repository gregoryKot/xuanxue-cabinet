import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AttachButton } from './AttachButton';

describe('AttachButton — один пункт', () => {
  it('нажатие сразу зовёт onSelect, меню не рисуется', async () => {
    const onSelect = vi.fn();
    render(
      <AttachButton
        ariaLabel="Видео вопроса"
        items={[{ key: 'video', label: 'Видео', onSelect }]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Видео вопроса' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('AttachButton — несколько пунктов', () => {
  function renderMenu() {
    const onImage = vi.fn();
    const onVideo = vi.fn();
    render(
      <AttachButton
        ariaLabel="Картинка или видео к варианту 1"
        items={[
          { key: 'image', label: 'Картинка', onSelect: onImage },
          { key: 'video', label: 'Видео', onSelect: onVideo },
        ]}
      />,
    );
    return { onImage, onVideo };
  }

  it('нажатие открывает меню из пунктов', async () => {
    renderMenu();
    const button = screen.getByRole('button', {
      name: 'Картинка или видео к варианту 1',
    });

    await userEvent.click(button);

    expect(screen.getByRole('menuitem', { name: 'Картинка' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Видео' })).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('выбор пункта зовёт его onSelect и закрывает меню', async () => {
    const { onImage } = renderMenu();
    await userEvent.click(
      screen.getByRole('button', { name: 'Картинка или видео к варианту 1' }),
    );

    await userEvent.click(screen.getByRole('menuitem', { name: 'Картинка' }));

    expect(onImage).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Escape закрывает меню', async () => {
    renderMenu();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Картинка или видео к варианту 1' }),
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('клик мимо закрывает меню', async () => {
    renderMenu();
    render(<button type="button">Снаружи</button>);
    await userEvent.click(
      screen.getByRole('button', { name: 'Картинка или видео к варианту 1' }),
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Снаружи' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it("работает с клавиатуры — открытие Enter'ом на кнопке, пункт активируется Enter", async () => {
    const { onVideo } = renderMenu();
    const user = userEvent.setup();
    const button = screen.getByRole('button', {
      name: 'Картинка или видео к варианту 1',
    });
    button.focus();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.tab();
    await user.tab();
    await user.keyboard('{Enter}');

    expect(onVideo).toHaveBeenCalledTimes(1);
  });
});
