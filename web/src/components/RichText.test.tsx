import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichText } from './RichText';

describe('RichText', () => {
  it('текст без ссылок и акцентов — рендерится как был, без лишних элементов', () => {
    const { container } = render(<RichText text="Повторите форму дыхания" />);

    expect(container).toHaveTextContent('Повторите форму дыхания');
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(container.querySelectorAll('strong')).toHaveLength(0);
  });

  it('https-ссылка — кликабельна, с href, target и rel', () => {
    render(<RichText text="Смотрите https://youtu.be/abc и повторите" />);

    const link = screen.getByRole('link', { name: 'https://youtu.be/abc' });
    expect(link).toHaveAttribute('href', 'https://youtu.be/abc');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('http-ссылка — тоже кликабельна', () => {
    render(<RichText text="http://example.com/video" />);

    expect(
      screen.getByRole('link', { name: 'http://example.com/video' }),
    ).toHaveAttribute('href', 'http://example.com/video');
  });

  it('javascript: остаётся текстом — ссылка не появляется', () => {
    const { container } = render(<RichText text="javascript:alert(1)" />);

    expect(container).toHaveTextContent('javascript:alert(1)');
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('data: остаётся текстом — ссылка не появляется', () => {
    const { container } = render(
      <RichText text="data:text/html,<script>alert(1)</script>" />,
    );

    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('финальная точка не попадает в href', () => {
    render(<RichText text="Смотрите https://ya.ru/v." />);

    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://ya.ru/v');
  });

  it('две ссылки в одной строке — два <a>', () => {
    render(<RichText text="https://a.ru и https://b.ru" />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://a.ru');
    expect(links[1]).toHaveAttribute('href', 'https://b.ru');
  });

  it('акцент **жирным** — рисуется <strong> без маркеров в тексте', () => {
    const { container } = render(<RichText text="Держите **спину прямо** ровно" />);

    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong).toHaveTextContent('спину прямо');
    expect(container).toHaveTextContent('Держите спину прямо ровно');
  });

  it('непарный маркер остаётся текстом — <strong> не появляется', () => {
    const { container } = render(<RichText text="Отступ в **два счёта" />);

    expect(container).toHaveTextContent('Отступ в **два счёта');
    expect(container.querySelectorAll('strong')).toHaveLength(0);
  });

  it('ссылка и акцент в одной строке — оба узла на месте', () => {
    render(<RichText text="Смотрите **внимательно** https://youtu.be/abc и повторите" />);

    const strong = screen.getByText('внимательно');
    expect(strong.tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: 'https://youtu.be/abc' })).toHaveAttribute(
      'href',
      'https://youtu.be/abc',
    );
  });

  it('маркер внутри ссылки не разбирается как акцент', () => {
    const { container } = render(<RichText text="https://a.ru/**path**" />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://a.ru/**path**');
    expect(container.querySelectorAll('strong')).toHaveLength(0);
  });
});
