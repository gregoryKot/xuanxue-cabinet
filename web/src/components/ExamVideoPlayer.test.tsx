import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExamVideoPlayer } from './ExamVideoPlayer';

describe('ExamVideoPlayer — файл (videoId)', () => {
  it('нативный video с controls/preload/src на /api/exam-videos/:id', () => {
    const { container } = render(<ExamVideoPlayer videoId="vid1" title="Вопрос" />);

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('src', '/api/exam-videos/vid1');
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video).toHaveAttribute('playsinline');
  });
});

describe('ExamVideoPlayer — видео-ответ (answerVideoId, ADR-0137)', () => {
  it('нативный video с src на /api/answer-videos/:id', () => {
    const { container } = render(
      <ExamVideoPlayer answerVideoId="av1" title="Ваш ответ" />,
    );

    const video = container.querySelector('video');
    expect(video).toHaveAttribute('src', '/api/answer-videos/av1');
    expect(video).toHaveAttribute('controls');
  });

  it('videoId побеждает answerVideoId, если заданы оба', () => {
    const { container } = render(<ExamVideoPlayer videoId="vid1" answerVideoId="av1" />);

    expect(container.querySelector('video')).toHaveAttribute(
      'src',
      '/api/exam-videos/vid1',
    );
  });
});

describe('ExamVideoPlayer — ссылка (videoUrl)', () => {
  it('рендерит VideoEmbed — кнопка «Смотреть здесь» до открытия', () => {
    render(<ExamVideoPlayer videoUrl="https://youtu.be/dQw4w9WgXcQ" title="Вопрос" />);

    expect(screen.getByRole('button', { name: 'Смотреть здесь' })).toBeInTheDocument();
  });

  it('хостинг не встраивается (VideoEmbed вернул null) — ничего не рендерится', () => {
    const { container } = render(<ExamVideoPlayer videoUrl="https://vk.com/video-1_2" />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('ExamVideoPlayer — ни файла, ни ссылки', () => {
  it('рендерит null', () => {
    const { container } = render(<ExamVideoPlayer />);

    expect(container).toBeEmptyDOMElement();
  });
});
