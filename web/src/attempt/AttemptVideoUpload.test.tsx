// Вёрстка загрузки видео-ответа (ADR-0137) — state machine мокается целиком
// (useAnswerVideoUpload.ts уже покрыт своими тестами), здесь проверяется
// только то, что видит и может нажать человек в каждой фазе.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AnswerVideoUploadState } from './useAnswerVideoUpload';
import { hasActiveUploads, resetActiveUploads } from './activeUploads';
import { AttemptVideoUpload } from './AttemptVideoUpload';
import type { AttemptVideoControls } from './useAttemptMedia';

const selectFile = vi.fn();
const cancel = vi.fn();
const resumeNow = vi.fn();
let currentState: AnswerVideoUploadState;

vi.mock('./useAnswerVideoUpload', () => ({
  useAnswerVideoUpload: () => ({
    state: currentState,
    selectFile,
    cancel,
    resumeNow,
  }),
}));

function idleState(): AnswerVideoUploadState {
  return {
    phase: 'idle',
    sentParts: 0,
    partCount: 0,
    totalBytes: 0,
    partBytes: 0,
    error: null,
  };
}

const VIDEO: AttemptVideoControls = {
  attemptId: 'a1',
  media: [],
  telegramLinked: false,
  offersTelegramLink: false,
  acceptsAnswers: true,
  addMediaLink: vi.fn(),
  linkStateFor: () => ({ pending: false, error: null }),
  fileUploadEnabled: true,
  applyMedia: vi.fn(),
};

describe('AttemptVideoUpload — idle', () => {
  // Аудит 2026-10-01 (H): пока часть файла летит, «Отправить» в подвале формы
  // обязано знать об этом (activeUploads.ts) — иначе рвало загрузку молча.
  it('пока идёт загрузка — отметка «идёт загрузка» стоит, после размонтирования снята', () => {
    resetActiveUploads();
    currentState = { ...idleState(), phase: 'uploading', partCount: 3, totalBytes: 24 };
    const { unmount } = render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);
    expect(hasActiveUploads()).toBe(true);

    unmount();
    expect(hasActiveUploads()).toBe(false);
  });

  it('кнопка выбора файла — единственное главное действие, объяснение до неё', () => {
    currentState = idleState();
    render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);

    expect(screen.getByText(/загрузите видео сюда/)).toBeInTheDocument();
    expect(screen.getByText(/до 1 ГБ/)).toBeInTheDocument();
    expect(screen.getByText(/90 дней после проверки/)).toBeInTheDocument();
    expect(screen.getByLabelText('Загрузить видео')).toHaveAttribute('accept', 'video/*');
  });

  it('выбор файла клавиатурой — input в таб-порядке (не display: none)', async () => {
    currentState = idleState();
    render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText('Загрузить видео');
    const file = new File([new Uint8Array(8)], 'form.mp4', { type: 'video/mp4' });

    await user.upload(input, file);

    expect(selectFile).toHaveBeenCalledWith(file);
  });
});

describe('AttemptVideoUpload — uploading', () => {
  it('полоса прогресса с семантикой progressbar и «N из M»', () => {
    currentState = {
      phase: 'uploading',
      sentParts: 1,
      partCount: 4,
      totalBytes: 32,
      partBytes: 8,
      error: null,
    };
    render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText(/из/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Загрузить видео')).not.toBeInTheDocument();
  });

  it('«Отменить» зовёт cancel()', async () => {
    currentState = {
      phase: 'uploading',
      sentParts: 1,
      partCount: 4,
      totalBytes: 32,
      partBytes: 8,
      error: null,
    };
    render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Отменить' }));

    expect(cancel).toHaveBeenCalled();
  });
});

describe('AttemptVideoUpload — waiting', () => {
  it('тихая строка про пропавшую связь и «Продолжить сейчас»', async () => {
    currentState = {
      phase: 'waiting',
      sentParts: 2,
      partCount: 4,
      totalBytes: 32,
      partBytes: 8,
      error: null,
    };
    render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);
    const user = userEvent.setup();

    expect(screen.getByText(/Связь пропала/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Продолжить сейчас' }));

    expect(resumeNow).toHaveBeenCalled();
  });
});

describe('AttemptVideoUpload — cancelled/failed', () => {
  it('cancelled — подсказка про повторный выбор того же файла, кнопка выбора снова видна', () => {
    currentState = {
      phase: 'cancelled',
      sentParts: 1,
      partCount: 4,
      totalBytes: 32,
      partBytes: 8,
      error: null,
    };
    render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);

    expect(screen.getByText(/продолжится с места остановки/)).toBeInTheDocument();
    expect(screen.getByLabelText('Загрузить видео')).toBeInTheDocument();
  });

  it('failed — только ошибка сервера: тот же файл отказ не исправит', () => {
    currentState = {
      phase: 'failed',
      sentParts: 1,
      partCount: 4,
      totalBytes: 32,
      partBytes: 8,
      error: { message: 'Файл, кажется, изменился' },
    };
    render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Файл, кажется, изменился');
    expect(screen.queryByText(/продолжится с места остановки/)).not.toBeInTheDocument();
  });
});
