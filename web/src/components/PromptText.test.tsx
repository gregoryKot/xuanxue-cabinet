import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PromptText } from './PromptText';

describe('PromptText', () => {
  it('текст без ссылок — рендерится как был, без лишних элементов', () => {
    const { container } = render(<PromptText text="Повторите форму дыхания" />);

    expect(container).toHaveTextContent('Повторите форму дыхания');
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('https-ссылка — кликабельна, с href, target и rel', () => {
    render(<PromptText text="Смотрите https://youtu.be/abc и повторите" />);

    const link = screen.getByRole('link', { name: 'https://youtu.be/abc' });
    expect(link).toHaveAttribute('href', 'https://youtu.be/abc');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('http-ссылка — тоже кликабельна', () => {
    render(<PromptText text="http://example.com/video" />);

    expect(
      screen.getByRole('link', { name: 'http://example.com/video' }),
    ).toHaveAttribute('href', 'http://example.com/video');
  });

  it('javascript: остаётся текстом — ссылка не появляется', () => {
    const { container } = render(<PromptText text="javascript:alert(1)" />);

    expect(container).toHaveTextContent('javascript:alert(1)');
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('data: остаётся текстом — ссылка не появляется', () => {
    const { container } = render(
      <PromptText text="data:text/html,<script>alert(1)</script>" />,
    );

    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('финальная точка не попадает в href', () => {
    render(<PromptText text="Смотрите https://ya.ru/v." />);

    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://ya.ru/v');
  });

  it('две ссылки в одной строке — два <a>', () => {
    render(<PromptText text="https://a.ru и https://b.ru" />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://a.ru');
    expect(links[1]).toHaveAttribute('href', 'https://b.ru');
  });
});
