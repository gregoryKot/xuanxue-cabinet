import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { VideoEmbed } from './VideoEmbed';

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

describe('VideoEmbed', () => {
  it('до нажатия — кнопка, iframe в документе нет', () => {
    render(<VideoEmbed url={YOUTUBE_URL} title="Занятие 12 сентября" />);

    expect(screen.getByRole('button', { name: 'Смотреть здесь' })).toBeInTheDocument();
    expect(document.querySelector('iframe')).not.toBeInTheDocument();
  });

  it('после нажатия — iframe с верным src и непустым title', async () => {
    render(<VideoEmbed url={YOUTUBE_URL} title="Занятие 12 сентября" />);

    await userEvent.click(screen.getByRole('button', { name: 'Смотреть здесь' }));

    const frame = document.querySelector('iframe');
    expect(frame).toBeInTheDocument();
    expect(frame).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(frame).toHaveAttribute('title', 'Занятие 12 сентября');
  });

  it('невстраиваемая ссылка (Яндекс.Диск) — компонент не рендерит ничего', () => {
    const { container } = render(<VideoEmbed url="https://disk.yandex.ru/i/aBcDeFgHiJkLmN" />);

    expect(container).toBeEmptyDOMElement();
  });
});
