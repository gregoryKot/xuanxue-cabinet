// Мокаем сам хук (не сеть) — ExamVideoField не знает, как устроена загрузка
// или проверка ссылки, только отражает состояние useExamVideoField, тот же
// приём, что ExamItemOptionImage.test.tsx для картинки.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExamVideoField } from './ExamVideoField';
import { useExamVideoField } from './useExamVideoField';

vi.mock('./useExamVideoField');

const mockedUseField = vi.mocked(useExamVideoField);

function stubField(overrides: Partial<ReturnType<typeof useExamVideoField>> = {}) {
  const uploadFile = vi.fn().mockResolvedValue(undefined);
  const commitUrl = vi.fn();
  const clear = vi.fn();
  const setUrlDraft = vi.fn();
  mockedUseField.mockReturnValue({
    uploadPending: false,
    error: null,
    urlDraft: '',
    setUrlDraft,
    uploadFile,
    commitUrl,
    clear,
    ...overrides,
  });
  return { uploadFile, commitUrl, clear, setUrlDraft };
}

const HINT = 'Покажите движение — ученик ответит, что в нём не так';

describe('ExamVideoField — уже есть видео', () => {
  it('videoId — плеер файла и «Убрать видео», без кнопки/поля', () => {
    stubField();
    render(
      <ExamVideoField
        inputLabel="Видео вопроса"
        hint={HINT}
        value={{ videoId: 'vid1' }}
        fileStorageEnabled
        onChange={vi.fn()}
      />,
    );

    expect(document.querySelector('video')).toHaveAttribute(
      'src',
      '/api/exam-videos/vid1',
    );
    expect(screen.getByRole('button', { name: 'Убрать видео' })).toBeInTheDocument();
    expect(screen.queryByText('Загрузить видео')).not.toBeInTheDocument();
  });

  it('videoUrl, R2 включён — ссылка всё равно видна как ссылка (ADR-0133)', () => {
    stubField();
    render(
      <ExamVideoField
        inputLabel="Видео вопроса"
        hint={HINT}
        value={{ videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }}
        fileStorageEnabled
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Смотреть здесь' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Убрать видео' })).toBeInTheDocument();
  });

  it('«Убрать видео» зовёт clear()', async () => {
    const { clear } = stubField();
    render(
      <ExamVideoField
        inputLabel="Видео вопроса"
        hint={HINT}
        value={{ videoId: 'vid1' }}
        fileStorageEnabled
        onChange={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Убрать видео' }));

    expect(clear).toHaveBeenCalled();
  });
});

describe('ExamVideoField — пусто, R2 подключён', () => {
  it('кнопка «Загрузить видео», подсказка видна, поля ссылки нет', () => {
    stubField();
    render(
      <ExamVideoField
        inputLabel="Видео вопроса"
        hint={HINT}
        value={{}}
        fileStorageEnabled
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Загрузить видео')).toBeInTheDocument();
    expect(screen.getByText(/Покажите движение/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Ссылка на видео (YouTube)')).not.toBeInTheDocument();
  });

  it('выбор файла зовёт uploadFile()', async () => {
    const { uploadFile } = stubField();
    render(
      <ExamVideoField
        inputLabel="Видео вопроса"
        hint={HINT}
        value={{}}
        fileStorageEnabled
        onChange={vi.fn()}
      />,
    );
    const file = new File(['видео'], 'clip.mp4', { type: 'video/mp4' });

    await userEvent.upload(screen.getByLabelText('Видео вопроса'), file);

    expect(uploadFile).toHaveBeenCalledWith(file);
  });

  it('pending — «Загружаем…» вместо кнопки', () => {
    stubField({ uploadPending: true });
    render(
      <ExamVideoField
        inputLabel="Видео вопроса"
        hint={HINT}
        value={{}}
        fileStorageEnabled
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Загружаем…')).toBeInTheDocument();
    expect(screen.queryByText('Загрузить видео')).not.toBeInTheDocument();
  });

  it('error — текст сбоя виден', () => {
    stubField({
      error: 'Такой формат не подходит. Загрузите видео в MP4, MOV или WebM.',
    });
    render(
      <ExamVideoField
        inputLabel="Видео вопроса"
        hint={HINT}
        value={{}}
        fileStorageEnabled
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Такой формат не подходит. Загрузите видео в MP4, MOV или WebM.'),
    ).toBeInTheDocument();
  });
});

describe('ExamVideoField — пусто, R2 не подключён', () => {
  it('поле ссылки видно, кнопки загрузки нет', () => {
    stubField();
    render(
      <ExamVideoField
        inputLabel="Видео вопроса"
        hint={HINT}
        value={{}}
        fileStorageEnabled={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Видео вопроса')).toHaveAttribute('type', 'url');
    expect(screen.queryByText('Загрузить видео')).not.toBeInTheDocument();
  });

  it('уход с поля непустой ссылки зовёт commitUrl()', async () => {
    const { setUrlDraft, commitUrl } = stubField({ urlDraft: 'https://youtu.be/x' });
    render(
      <ExamVideoField
        inputLabel="Видео вопроса"
        hint={HINT}
        value={{}}
        fileStorageEnabled={false}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('Видео вопроса');
    await userEvent.type(input, 'x');
    input.blur();

    expect(setUrlDraft).toHaveBeenCalled();
    expect(commitUrl).toHaveBeenCalled();
  });

  it('уход с пустого поля не зовёт commitUrl()', () => {
    const { commitUrl } = stubField({ urlDraft: '' });
    render(
      <ExamVideoField
        inputLabel="Видео вопроса"
        hint={HINT}
        value={{}}
        fileStorageEnabled={false}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('Видео вопроса');
    input.focus();
    input.blur();

    expect(commitUrl).not.toHaveBeenCalled();
  });

  it('error ссылки — виден под полем', () => {
    stubField({ error: 'Ссылка должна начинаться с https://.' });
    render(
      <ExamVideoField
        inputLabel="Видео вопроса"
        hint={HINT}
        value={{}}
        fileStorageEnabled={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Ссылка должна начинаться с https://.')).toBeInTheDocument();
  });
});
