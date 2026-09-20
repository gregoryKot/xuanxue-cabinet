import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PostPreview } from './PostPreview';

describe('PostPreview', () => {
  it('показывает текст как есть, в <pre>', () => {
    const { container } = render(<PostPreview text={'строка1\nстрока2'} />);
    const pre = container.querySelector('pre');
    expect(pre?.textContent).toBe('строка1\nстрока2');
  });
});

// Переезд на «Тёплую школу» (ADR-0043): превью легло на белую поверхность с
// радиусом строки списка, границы у него больше нет, а тени нет намеренно
// (шапка PostPreview.tsx: внутри DeliveryCard тень на тени читается грязно).
// jsdom не вычисляет `var(--…)` — сравниваем ровно строку инлайн-стиля, не
// вычисленный цвет; у cssstyle сокращённое `style.borderBottom` для снятой
// границы отдаёт 'medium', поэтому спрашиваем borderBottomStyle.
describe('PostPreview — облик (ADR-0043)', () => {
  it('поверхность превью — var(--card) с радиусом строки списка, без границы и тени', () => {
    const { container } = render(<PostPreview text="Текст поста" />);

    const pre = container.querySelector('pre');
    expect(pre?.style.background).toBe('var(--card)');
    expect(pre?.style.borderRadius).toBe('var(--radius-card)');
    expect(pre?.style.borderBottomStyle).toBe('');
    expect(pre?.style.boxShadow).toBe('');
  });
});
