import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto, ExamMediaDto } from '@xuanxue/shared';
import { AttemptMediaPrompt } from './AttemptMediaPrompt';

function makeAttempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    status: 'submitted',
    blocks: [],
    answers: [],
    startedAt: '2026-09-01T00:00:00Z',
    expired: false,
    ...overrides,
  };
}

function renderPrompt(overrides: Partial<Parameters<typeof AttemptMediaPrompt>[0]> = {}) {
  const onAddMediaLink = vi.fn().mockResolvedValue(true);
  render(
    <AttemptMediaPrompt
      attempt={makeAttempt()}
      onAddMediaLink={onAddMediaLink}
      addingMediaLink={false}
      addMediaLinkError={null}
      {...overrides}
    />,
  );
  return { onAddMediaLink };
}

describe('AttemptMediaPrompt — видео ещё не получено', () => {
  it('объяснение и форма ссылки видны, кнопки в Telegram нет без имени бота', () => {
    renderPrompt();

    expect(
      screen.getByText(
        'Учитель смотрит форму по видео — пришлите запись, как вы её выполнили.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Ссылка на видео')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Отправить видео боту/ }),
    ).not.toBeInTheDocument();
  });

  it('имя бота есть — кнопка-ссылка на чат с правильным deep link', () => {
    renderPrompt({ telegramBotUsername: 'xuanxue_bot' });

    const link = screen.getByRole('link', { name: 'Отправить видео боту в Telegram' });
    expect(link).toHaveAttribute('href', 'https://t.me/xuanxue_bot?start=exam_a1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('AttemptMediaPrompt — видео уже получено', () => {
  const RECEIVED: ExamMediaDto = {
    id: 'm1',
    attemptId: 'a1',
    kind: 'link',
    url: 'https://example.com/v',
    receivedAt: '2026-09-12T00:00:00Z',
  };

  it('вместо формы — честная строка, что и когда пришло', () => {
    renderPrompt({ attempt: makeAttempt({ media: [RECEIVED] }) });

    expect(screen.getByText(/Видео получено/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Ссылка на видео')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Учитель смотрит форму по видео — пришлите запись, как вы её выполнили.',
      ),
    ).not.toBeInTheDocument();
  });
});
