// Строка вопроса — номер, формулировка, видео (ADR-0133) и отметка «без
// ответа». Остальные ветки (RichText, unanswered) уже проверены через
// экраны, которые её используют; здесь — то, что специфично для самой
// строки, включая новое видео формулировки.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuestionRow } from './QuestionRow';

describe('QuestionRow — видео формулировки (ADR-0133)', () => {
  it('videoId — плеер файла виден под формулировкой', () => {
    render(
      <QuestionRow
        index={0}
        promptId="p1"
        prompt="Что не так в этом движении?"
        videoId="vid1"
      />,
    );

    expect(document.querySelector('video')).toHaveAttribute(
      'src',
      '/api/exam-videos/vid1',
    );
  });

  it('videoUrl — плеер ссылки виден под формулировкой', () => {
    render(
      <QuestionRow
        index={0}
        promptId="p1"
        prompt="Что не так в этом движении?"
        videoUrl="https://youtu.be/dQw4w9WgXcQ"
      />,
    );

    expect(screen.getByRole('button', { name: 'Смотреть здесь' })).toBeInTheDocument();
  });

  it('без видео — плеера нет вовсе', () => {
    render(<QuestionRow index={0} promptId="p1" prompt="Обычный вопрос" />);

    expect(document.querySelector('video')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Смотреть здесь' }),
    ).not.toBeInTheDocument();
  });
});
