// Плеер записи занятия с файлом из кабинета (ADR-0180) в списке записей
// страницы занятия: файл играет первым, ссылка остаётся ссылкой.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecordingList } from './RecordingList';

describe('RecordingList — запись с файлом (videoId)', () => {
  it('нативный video с src на /api/lesson-videos/:id и кадром на /poster', () => {
    const { container } = render(
      <RecordingList
        recordings={[{ id: 'r1', title: 'Занятие целиком', videoId: 'v1' }]}
      />,
    );

    const video = container.querySelector('video');
    expect(video).toHaveAttribute('src', '/api/lesson-videos/v1');
    expect(video).toHaveAttribute('poster', '/api/lesson-videos/v1/poster');
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('aria-label', 'Занятие целиком');
    expect(screen.getByText('Занятие целиком')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('файл и ссылка вместе: видео из кабинета раньше ссылки', () => {
    const { container } = render(
      <RecordingList
        recordings={[
          {
            id: 'r1',
            title: 'Часть 1',
            videoId: 'v1',
            url: 'https://youtu.be/dQw4w9WgXcQ',
          },
        ]}
      />,
    );

    const video = container.querySelector('video');
    const link = screen.getByRole('link', { name: 'Открыть по ссылке' });
    expect(link).toHaveAttribute('href', 'https://youtu.be/dQw4w9WgXcQ');
    expect(screen.getByRole('button', { name: 'Смотреть здесь' })).toBeInTheDocument();
    expect(
      video?.compareDocumentPosition(link) === Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(true);
  });

  it('запись только со ссылкой — как раньше: ссылка с названием, video нет', () => {
    const { container } = render(
      <RecordingList
        recordings={[{ id: 'r1', title: 'Часть 1', url: 'https://youtu.be/1' }]}
      />,
    );

    expect(screen.getByRole('link', { name: 'Часть 1' })).toHaveAttribute(
      'href',
      'https://youtu.be/1',
    );
    expect(container.querySelector('video')).toBeNull();
  });

  it('файл без названия — подпись «Запись»', () => {
    render(<RecordingList recordings={[{ id: 'r1', title: '', videoId: 'v1' }]} />);

    expect(screen.getByText('Запись')).toBeInTheDocument();
  });
});
