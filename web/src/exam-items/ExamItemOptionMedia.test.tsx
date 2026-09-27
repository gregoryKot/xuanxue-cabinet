// Переключение между картинкой и видео варианта (ADR-0035/ADR-0133) —
// логика ExamItemOptionImage/ExamVideoField покрыта в их файлах, здесь только
// то, какой из них рисуется в зависимости от того, что уже стоит у варианта.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExamItemOptionMedia } from './ExamItemOptionMedia';
import { useExamImageUpload } from './useExamImageUpload';
import { useExamVideoField } from './useExamVideoField';

vi.mock('./useExamImageUpload');
vi.mock('./useExamVideoField');

vi.mocked(useExamImageUpload).mockReturnValue({
  upload: vi.fn(),
  pending: false,
  error: null,
});
vi.mocked(useExamVideoField).mockReturnValue({
  uploadPending: false,
  error: null,
  urlDraft: '',
  setUrlDraft: vi.fn(),
  uploadFile: vi.fn(),
  commitUrl: vi.fn(),
  clear: vi.fn(),
});

describe('ExamItemOptionMedia — ни картинки, ни видео', () => {
  it('показывает оба способа сразу — «Добавить картинку» и поле видео', () => {
    render(
      <ExamItemOptionMedia
        index={0}
        fileStorageEnabled={false}
        onImageChange={vi.fn()}
        onVideoChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Добавить картинку')).toBeInTheDocument();
    expect(screen.getByLabelText('Видео варианта 1')).toBeInTheDocument();
  });
});

describe('ExamItemOptionMedia — картинка стоит', () => {
  it('показывает только картинку, поля видео нет', () => {
    render(
      <ExamItemOptionMedia
        index={0}
        imageId="img1"
        fileStorageEnabled={false}
        onImageChange={vi.fn()}
        onVideoChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('img', { name: 'Картинка варианта 1' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Видео варианта 1')).not.toBeInTheDocument();
  });
});

describe('ExamItemOptionMedia — видео стоит', () => {
  it('videoId — показывает только плеер видео, кнопки картинки нет', () => {
    render(
      <ExamItemOptionMedia
        index={1}
        videoId="vid1"
        fileStorageEnabled
        onImageChange={vi.fn()}
        onVideoChange={vi.fn()}
      />,
    );

    expect(document.querySelector('video')).toHaveAttribute(
      'src',
      '/api/exam-videos/vid1',
    );
    expect(screen.queryByText('Добавить картинку')).not.toBeInTheDocument();
  });

  it('videoUrl — показывает плеер ссылки', () => {
    render(
      <ExamItemOptionMedia
        index={1}
        videoUrl="https://youtu.be/dQw4w9WgXcQ"
        fileStorageEnabled
        onImageChange={vi.fn()}
        onVideoChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Смотреть здесь' })).toBeInTheDocument();
    expect(screen.queryByText('Добавить картинку')).not.toBeInTheDocument();
  });
});
