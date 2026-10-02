// Вёрстка прогресса загрузки видео (ADR-0137, ADR-0165) — чистая функция
// состояния: здесь проверяется то, что видит и может нажать человек в каждой
// фазе. Сам хук мокать не нужно: состояние приходит пропсом.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VideoUploadProgress } from './VideoUploadProgress';
import { IDLE_VIDEO_UPLOAD_STATE, type VideoUploadState } from './videoUploadState';

function stateIn(phase: VideoUploadState['phase'], sentParts = 1): VideoUploadState {
  return {
    ...IDLE_VIDEO_UPLOAD_STATE,
    phase,
    sentParts,
    partCount: 4,
    totalBytes: 32,
    partBytes: 8,
  };
}

function renderProgress(state: VideoUploadState) {
  const onCancel = vi.fn();
  const onResume = vi.fn();
  render(<VideoUploadProgress state={state} onCancel={onCancel} onResume={onResume} />);
  return { onCancel, onResume };
}

describe('VideoUploadProgress — idle/done', () => {
  it.each(['idle', 'done'] as const)('в фазе %s не рисует ничего', (phase) => {
    renderProgress(stateIn(phase));

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('VideoUploadProgress — uploading', () => {
  it('полоса прогресса с семантикой progressbar и «N из M»', () => {
    renderProgress(stateIn('uploading'));

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText(/из/)).toBeInTheDocument();
  });

  it('«Отменить» зовёт onCancel, «Продолжить сейчас» без паузы не показан', async () => {
    const { onCancel } = renderProgress(stateIn('uploading'));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Отменить' }));

    expect(onCancel).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Продолжить сейчас' })).toBeNull();
  });
});

describe('VideoUploadProgress — compressing', () => {
  it('«Сжимаем видео — 40%» с полосой на те же 40% и «Отменить»', async () => {
    const { onCancel } = renderProgress({
      ...stateIn('compressing', 0),
      compressProgress: 0.4,
    });
    const user = userEvent.setup();

    const bar = screen.getByRole('progressbar', { name: 'Сжатие видео' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText('40%').tagName).toBe('STRONG');
    expect(screen.getByText(/Сжимаем видео/)).toBeInTheDocument();
    expect(screen.queryByText(/из/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('на сжатии нет «Продолжить сейчас»: паузы у него нет', () => {
    renderProgress(stateIn('compressing', 0));

    expect(screen.queryByRole('button', { name: 'Продолжить сейчас' })).toBeNull();
  });
});

describe('VideoUploadProgress — waiting', () => {
  it('тихая строка про пропавшую связь и «Продолжить сейчас»', async () => {
    const { onResume } = renderProgress(stateIn('waiting', 2));
    const user = userEvent.setup();

    expect(screen.getByText(/Связь пропала/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Продолжить сейчас' }));

    expect(onResume).toHaveBeenCalled();
  });
});

describe('VideoUploadProgress — cancelled/failed', () => {
  it('cancelled — подсказка про повторный выбор того же файла, без полосы', () => {
    renderProgress(stateIn('cancelled'));

    expect(screen.getByText(/продолжится с места остановки/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('failed — только ошибка сервера: тот же файл отказ не исправит', () => {
    renderProgress({
      ...stateIn('failed'),
      error: { message: 'Файл, кажется, изменился' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Файл, кажется, изменился');
    expect(screen.queryByText(/продолжится с места остановки/)).not.toBeInTheDocument();
  });
});
