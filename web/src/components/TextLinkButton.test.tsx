// Регрессия механизма текстовой ссылки-кнопки (docs/adr/0099): линия должна
// стоять на внутреннем `<span>` вокруг видимого текста, а не на самой
// `<button>`. Раньше `border-bottom` рисовался на коробке высотой 44px (цель
// нажатия) и оказывался в десятке пикселей от букв — кнопка читалась обычным
// абзацем (отзыв владельца 2026-09-21: «Как выложить видео, чтобы учитель
// его открыл» и «У меня нет Telegram» — непонятно, что это кнопка).
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TextLinkButton } from './TextLinkButton';

const LABEL = 'Отменить';

describe('TextLinkButton', () => {
  it('линия — на внутреннем элементе с текстом, не на самой кнопке', () => {
    render(<TextLinkButton onClick={vi.fn()}>{LABEL}</TextLinkButton>);

    const button = screen.getByRole('button');
    const line = screen.getByText(LABEL);
    const buttonStyle = getComputedStyle(button);
    const lineStyle = getComputedStyle(line);

    // jsdom не резолвит `var()` внутри составного `border-bottom` (ограничение
    // библиотеки cssstyle, не браузера), поэтому увидеть здесь буквальный
    // '1px' нельзя — но по тому же артефакту чётко видно, где граница
    // объявлена. У кнопки border явно обнулён (`border: 0` из
    // textLinkHitAreaStyle — без var(), парсится честно) и даёт ровно '0px';
    // у элемента с textLinkLineStyle borderBottomWidth не '0px' вовсе —
    // граница на нём есть.
    expect(buttonStyle.borderBottomWidth).toBe('0px');
    expect(lineStyle.borderBottomWidth).not.toBe('0px');
    expect(lineStyle.borderBottomWidth).not.toBe('');

    // paddingBottom без var() парсится точно — им проверяем вторую половину
    // того же переноса: отступ «под буквами» (2px, textLinkLineStyle) не
    // должен совпасть с отступом цели нажатия (10px, textLinkHitAreaStyle) —
    // граница и её отступ переезжают во внутренний `<span>` одной парой.
    expect(buttonStyle.paddingBottom).toBe('10px');
    expect(lineStyle.paddingBottom).toBe('2px');
  });

  it('нажатие вызывает onClick', () => {
    const onClick = vi.fn();
    render(<TextLinkButton onClick={onClick}>{LABEL}</TextLinkButton>);

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled доходит до <button>', () => {
    render(
      <TextLinkButton onClick={vi.fn()} disabled>
        {LABEL}
      </TextLinkButton>,
    );

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
