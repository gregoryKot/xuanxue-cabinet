import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ANSWER_VIDEO_RETENTION, type ExamMediaDto } from '@xuanxue/shared';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { AttemptVideoAnswerRow } from './AttemptVideoAnswerRow';

stubViewerTimeZone();

function makeMedia(overrides: Partial<ExamMediaDto> = {}): ExamMediaDto {
  return {
    id: 'm1',
    attemptId: 'a1',
    itemId: 'q1',
    kind: 'file',
    receivedAt: '2026-09-12T16:30:00.000Z',
    ...overrides,
  };
}

describe('AttemptVideoAnswerRow — kind file (ADR-0137)', () => {
  it('плеер по answerVideoId, размер файла рядом со временем получения', () => {
    render(
      <AttemptVideoAnswerRow
        media={makeMedia({ answerVideoId: 'v1', sizeBytes: 2 * 1024 * 1024 })}
      />,
    );

    expect(screen.getByText('Вы загрузили видео в кабинет')).toBeInTheDocument();
    const video = document.querySelector('video');
    expect(video).toHaveAttribute('src', '/api/answer-videos/v1');
    expect(screen.getByText(/2,0 МБ/)).toBeInTheDocument();
  });

  it('без answerVideoId (уборщик снял файл) — честная строка, не сломанный плеер', () => {
    render(<AttemptVideoAnswerRow media={makeMedia()} />);

    expect(document.querySelector('video')).toBeNull();
    expect(
      screen.getByText(
        new RegExp(`${ANSWER_VIDEO_RETENTION.afterGradedDays} дней после проверки`),
      ),
    ).toBeInTheDocument();
  });

  it('без sizeBytes — время получения без размера рядом', () => {
    render(<AttemptVideoAnswerRow media={makeMedia({ answerVideoId: 'v1' })} />);

    expect(screen.getByText(/Получено/)).not.toHaveTextContent('МБ');
  });
});

describe('AttemptVideoAnswerRow — note', () => {
  it('note виден отдельной строкой', () => {
    render(
      <AttemptVideoAnswerRow
        media={makeMedia({ kind: 'manual', note: 'Прислал в личку ВКонтакте' })}
      />,
    );

    expect(screen.getByText('Прислал в личку ВКонтакте')).toBeInTheDocument();
  });
});
