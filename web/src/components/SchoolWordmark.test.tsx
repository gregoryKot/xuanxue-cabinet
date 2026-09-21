// Название школы — гротеск (Golos Text), не антиква: ADR-0043 закрепляет
// антикву (Cormorant Garamond) только заголовкам экранов, а «Школа
// Сюань-Сюэ» рядом со знаком — знак места, не заголовок. До этой правки два
// начертания из трёх точек входа всё равно были антиквой (боковая колонка,
// строка оболочки), и владелец увидел на снимке кабинета двойную антикву
// разом — «слишком много шрифтов». Гейт от возврата к антикве здесь.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SchoolWordmark } from './SchoolWordmark';

describe('SchoolWordmark', () => {
  it('название набрано гротеском — в стиле нет антиквы (--font-display)', () => {
    render(<SchoolWordmark />);

    const title = screen.getByText('Школа Сюань-Сюэ');
    expect(title.style.fontFamily).not.toContain('--font-display');
  });

  it('знак и название рисуются вместе', () => {
    const { container } = render(<SchoolWordmark />);

    expect(screen.getByText('Школа Сюань-Сюэ')).toBeInTheDocument();
    // Знак декоративный (alt="", SchoolMark.tsx) — доступное имя строки
    // целиком несёт видимый текст рядом.
    expect(container.querySelector('img[alt=""]')).not.toBeNull();
  });
});
