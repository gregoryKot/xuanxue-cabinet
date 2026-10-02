// Экран загрузки видео-ответа (ADR-0137) — state machine мокается целиком
// (video-upload/useVideoUpload.ts покрыт своими тестами, а вёрстка прогресса —
// VideoUploadProgress.test.tsx), здесь проверяется то, что принадлежит самому
// экрану: объяснение, выбор файла, отметка «идёт загрузка» и подключение
// кнопок прогресса к хуку.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  ANSWER_VIDEO_LIMITS,
  ANSWER_VIDEO_TOO_LARGE_MESSAGE,
  type ExamMediaDto,
} from '@xuanxue/shared';
import type { UseVideoUploadOptions } from '../video-upload/useVideoUpload';
import {
  IDLE_VIDEO_UPLOAD_STATE,
  type VideoUploadState,
} from '../video-upload/videoUploadState';
import { hasActiveUploads, resetActiveUploads } from './activeUploads';
import { answerVideoTransport } from './answerVideoTransport';
import { AttemptVideoUpload } from './AttemptVideoUpload';
import type { AttemptVideoControls } from './useAttemptMedia';

const selectFile = vi.fn();
const cancel = vi.fn();
const resumeNow = vi.fn();
let currentState: VideoUploadState;
let lastOptions: UseVideoUploadOptions<ExamMediaDto> | undefined;

vi.mock('../video-upload/useVideoUpload', () => ({
  useVideoUpload: (options: UseVideoUploadOptions<ExamMediaDto>) => {
    lastOptions = options;
    return { state: currentState, selectFile, cancel, resumeNow };
  },
}));

vi.mock('./answerVideoTransport', () => ({
  answerVideoTransport: vi.fn(() => ({})),
}));

function stateIn(
  phase: VideoUploadState['phase'],
  overrides: Partial<VideoUploadState> = {},
): VideoUploadState {
  return {
    ...IDLE_VIDEO_UPLOAD_STATE,
    phase,
    sentParts: 1,
    partCount: 4,
    totalBytes: 32,
    partBytes: 8,
    ...overrides,
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
    currentState = stateIn('uploading', { sentParts: 0, partCount: 3, totalBytes: 24 });
    const { unmount } = render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);
    expect(hasActiveUploads()).toBe(true);

    unmount();
    expect(hasActiveUploads()).toBe(false);
  });

  it('кнопка выбора файла — единственное главное действие, объяснение до неё', () => {
    currentState = IDLE_VIDEO_UPLOAD_STATE;
    render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);

    expect(screen.getByText(/загрузите видео сюда/)).toBeInTheDocument();
    expect(screen.getByText(/до 1 ГБ/)).toBeInTheDocument();
    expect(screen.getByText(/90 дней после проверки/)).toBeInTheDocument();
    expect(screen.getByLabelText('Загрузить видео')).toHaveAttribute('accept', 'video/*');
  });

  it('выбор файла клавиатурой — input в таб-порядке (не display: none)', async () => {
    currentState = IDLE_VIDEO_UPLOAD_STATE;
    render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText('Загрузить видео');
    const file = new File([new Uint8Array(8)], 'form.mp4', { type: 'video/mp4' });

    await user.upload(input, file);

    expect(selectFile).toHaveBeenCalledWith(file);
  });
});

describe('AttemptVideoUpload — что отдаётся общему загрузчику', () => {
  it('транспорт этой попытки и этого вопроса, потолок ответа и «готово» в попытку', () => {
    currentState = IDLE_VIDEO_UPLOAD_STATE;
    render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);

    lastOptions?.createTransport();

    expect(answerVideoTransport).toHaveBeenCalledWith('a1', 'q1');
    expect(lastOptions?.maxBytes).toBe(ANSWER_VIDEO_LIMITS.maxBytes);
    expect(lastOptions?.tooLargeMessage).toBe(ANSWER_VIDEO_TOO_LARGE_MESSAGE);
    expect(lastOptions?.onDone).toBe(VIDEO.applyMedia);
  });
});

describe('AttemptVideoUpload — фазы', () => {
  it('uploading — выбор файла спрятан, полоса прогресса показана', () => {
    currentState = stateIn('uploading');
    render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByLabelText('Загрузить видео')).not.toBeInTheDocument();
  });

  it('«Отменить» и «Продолжить сейчас» зовут cancel() и resumeNow() хука', async () => {
    currentState = stateIn('waiting', { sentParts: 2 });
    render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Продолжить сейчас' }));
    await user.click(screen.getByRole('button', { name: 'Отменить' }));

    expect(resumeNow).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });

  it('cancelled — подсказка про тот же файл и кнопка выбора снова видна', () => {
    currentState = stateIn('cancelled');
    render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);

    expect(screen.getByText(/продолжится с места остановки/)).toBeInTheDocument();
    expect(screen.getByLabelText('Загрузить видео')).toBeInTheDocument();
  });

  it('failed — ошибка сервера под кнопкой выбора', () => {
    currentState = stateIn('failed', { error: { message: 'Файл, кажется, изменился' } });
    render(<AttemptVideoUpload itemId="q1" video={VIDEO} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Файл, кажется, изменился');
    expect(screen.getByLabelText('Загрузить видео')).toBeInTheDocument();
  });
});
