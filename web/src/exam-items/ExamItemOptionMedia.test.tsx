// Сборка скрепки и превью варианта — сама механика загрузки и меню покрыта в
// useImageAttach.test.tsx/useVideoAttach.test.tsx/AttachButton.test.tsx,
// здесь только то, что ExamItemOptionMedia собирает из них: два пункта меню
// одной скрепки и выбор превью (картинка приоритетнее видео, потому что её
// превью показывает и процесс загрузки — ExamItemOptionMedia.tsx).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExamItemOptionMedia } from './ExamItemOptionMedia';
import { useImageAttach, type ImageAttachResult } from './useImageAttach';
import { useVideoAttach, type VideoAttachResult } from './useVideoAttach';

vi.mock('./useImageAttach');
vi.mock('./useVideoAttach');

const mockedImage = vi.mocked(useImageAttach);
const mockedVideo = vi.mocked(useVideoAttach);

function stubImage(overrides: Partial<ImageAttachResult> = {}): ImageAttachResult {
  const result: ImageAttachResult = {
    menuItem: { key: 'image', label: 'Картинка', onSelect: vi.fn() },
    hiddenInput: <input aria-label="Картинка варианта 1" type="file" readOnly />,
    preview: null,
    error: null,
    ...overrides,
  };
  mockedImage.mockReturnValue(result);
  return result;
}

function stubVideo(overrides: Partial<VideoAttachResult> = {}): VideoAttachResult {
  const result: VideoAttachResult = {
    menuItem: { key: 'video', label: 'Видео', onSelect: vi.fn() },
    hiddenInput: null,
    preview: null,
    error: null,
    ...overrides,
  };
  mockedVideo.mockReturnValue(result);
  return result;
}

describe('ExamItemOptionMedia — скрепка', () => {
  it('меню — оба пункта, «Картинка» ведёт к своему onSelect, «Видео» — к своему', async () => {
    const image = stubImage();
    const video = stubVideo();
    render(
      <ExamItemOptionMedia
        index={0}
        fileStorageEnabled={false}
        onImageChange={vi.fn()}
        onVideoChange={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Картинка или видео к варианту 1' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Видео' }));

    expect(video.menuItem.onSelect).toHaveBeenCalledTimes(1);
    expect(image.menuItem.onSelect).not.toHaveBeenCalled();
  });

  it('скрытые input обоих хуков в разметке', () => {
    stubImage();
    stubVideo({
      hiddenInput: <input aria-label="Видео варианта 1" type="file" readOnly />,
    });
    render(
      <ExamItemOptionMedia
        index={0}
        fileStorageEnabled
        onImageChange={vi.fn()}
        onVideoChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Картинка варианта 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Видео варианта 1')).toBeInTheDocument();
  });
});

describe('ExamItemOptionMedia — какое превью показано', () => {
  it('нет ни картинки, ни видео — превью нет', () => {
    stubImage();
    stubVideo();
    render(
      <ExamItemOptionMedia
        index={0}
        fileStorageEnabled={false}
        onImageChange={vi.fn()}
        onVideoChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('image-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('video-preview')).not.toBeInTheDocument();
  });

  it('превью картинки есть — показано оно, видео не рисуется', () => {
    stubImage({ preview: <div data-testid="image-preview" /> });
    stubVideo({ preview: <div data-testid="video-preview" /> });
    render(
      <ExamItemOptionMedia
        index={0}
        imageId="img1"
        fileStorageEnabled={false}
        onImageChange={vi.fn()}
        onVideoChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('image-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('video-preview')).not.toBeInTheDocument();
  });

  it('превью картинки нет — показано превью видео', () => {
    stubImage({ preview: null });
    stubVideo({ preview: <div data-testid="video-preview" /> });
    render(
      <ExamItemOptionMedia
        index={0}
        videoId="vid1"
        fileStorageEnabled
        onImageChange={vi.fn()}
        onVideoChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('video-preview')).toBeInTheDocument();
  });
});
