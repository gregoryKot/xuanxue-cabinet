import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ExamMediaDto } from '@xuanxue/shared';
import { AttemptReviewMedia } from './AttemptReviewMedia';

function makeMedia(overrides: Partial<ExamMediaDto> = {}): ExamMediaDto {
  return {
    id: 'm1',
    attemptId: 'a1',
    kind: 'telegram',
    receivedAt: '2026-09-12T00:00:00Z',
    ...overrides,
  };
}

function renderMedia(overrides: Partial<Parameters<typeof AttemptReviewMedia>[0]> = {}) {
  const onMarkManual = vi.fn().mockResolvedValue(true);
  render(
    <AttemptReviewMedia
      media={[]}
      onMarkManual={onMarkManual}
      marking={false}
      markError={null}
      {...overrides}
    />,
  );
  return { onMarkManual };
}

describe('AttemptReviewMedia — видео нет', () => {
  it('честная строка и кнопка «Отметить, что видео принято»', async () => {
    const user = userEvent.setup();
    const { onMarkManual } = renderMedia();

    expect(screen.getByText('Видео пока не получено.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Отметить, что видео принято' }));

    expect(onMarkManual).toHaveBeenCalled();
  });

  it('сбой ручной отметки — ошибка видна под кнопкой', () => {
    renderMedia({ markError: { message: 'Не удалось отметить видео.' } });

    expect(screen.getByText('Не удалось отметить видео.')).toBeInTheDocument();
  });

  it('без onMarkManual (блок «без вопроса») — кнопки нет, ничего не падает', () => {
    render(<AttemptReviewMedia media={[]} />);

    expect(screen.getByText('Видео пока не получено.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Отметить, что видео принято' }),
    ).not.toBeInTheDocument();
  });
});

describe('AttemptReviewMedia — заголовок', () => {
  it('heading задан — заголовок виден', () => {
    renderMedia({ heading: 'Видео без вопроса' });

    expect(
      screen.getByRole('heading', { name: 'Видео без вопроса' }),
    ).toBeInTheDocument();
  });

  it('heading не задан (видео-вопрос) — заголовка нет', () => {
    renderMedia();

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});

describe('AttemptReviewMedia — каждый вид получения', () => {
  it('kind: telegram — длительность и текст «смотрите там же», без ссылки', () => {
    renderMedia({ media: [makeMedia({ kind: 'telegram', durationSec: 220 })] });

    expect(screen.getByText(/3 мин 40 с/)).toBeInTheDocument();
    expect(
      screen.getByText('Переслано боту в Telegram. Видео смотрите там же.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('kind: link — кликабельная ссылка, открывается в новой вкладке', () => {
    renderMedia({
      media: [makeMedia({ kind: 'link', url: 'https://example.com/v' })],
    });

    const link = screen.getByRole('link', { name: 'Открыть ссылку на видео' });
    expect(link).toHaveAttribute('href', 'https://example.com/v');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('kind: manual — подпись учителя видна', () => {
    renderMedia({
      media: [makeMedia({ kind: 'manual', note: 'Прислал в личку ВКонтакте' })],
    });

    expect(
      screen.getByText('Отмечено вручную: Прислал в личку ВКонтакте'),
    ).toBeInTheDocument();
  });

  it('несколько записей — кнопка «Отметить вручную» не нужна и не видна', () => {
    renderMedia({ media: [makeMedia(), makeMedia({ id: 'm2' })] });

    expect(
      screen.queryByRole('button', { name: 'Отметить, что видео принято' }),
    ).not.toBeInTheDocument();
  });
});
