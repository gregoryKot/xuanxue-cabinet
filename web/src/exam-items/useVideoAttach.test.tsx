// Мокаем сам хук (не сеть) — useVideoAttach не знает, как устроена загрузка
// или проверка ссылки, только отражает состояние useExamVideoField
// (useExamVideoField.test.ts проверяет сеть и валидацию отдельно). Хук
// возвращает JSX — обёртка-компонент рендерит его, как это делает вызывающая
// сторона (ExamItemFormFields.tsx, ExamItemOptionMedia.tsx).
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useVideoAttach } from './useVideoAttach';
import { useExamVideoField } from './useExamVideoField';
import type { ExamVideoValue } from './examVideoFormInput';

vi.mock('./useExamVideoField');

const mockedUseField = vi.mocked(useExamVideoField);

function stubField(overrides: Partial<ReturnType<typeof useExamVideoField>> = {}) {
  const uploadFile = vi.fn().mockResolvedValue(undefined);
  const commitUrl = vi.fn();
  const clear = vi.fn();
  const setUrlDraft = vi.fn();
  mockedUseField.mockReturnValue({
    uploadPending: false,
    uploadProgress: null,
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

function Harness({
  value,
  fileStorageEnabled,
  onChange,
}: {
  value: ExamVideoValue;
  fileStorageEnabled: boolean;
  onChange: (next: ExamVideoValue) => void;
}) {
  const attach = useVideoAttach('Видео вопроса', value, fileStorageEnabled, onChange);
  return (
    <>
      <button type="button" onClick={attach.menuItem.onSelect}>
        {attach.menuItem.label}
      </button>
      {attach.hiddenInput}
      {attach.preview}
    </>
  );
}

describe('useVideoAttach — уже есть видео', () => {
  it('videoId — плеер и «Убрать видео», поля/кнопки загрузки нет', () => {
    stubField();
    render(<Harness value={{ videoId: 'vid1' }} fileStorageEnabled onChange={vi.fn()} />);

    expect(document.querySelector('video')).toHaveAttribute(
      'src',
      '/api/exam-videos/vid1',
    );
    expect(screen.getByRole('button', { name: 'Убрать видео' })).toBeInTheDocument();
  });

  it('videoUrl, R2 включён — ссылка всё равно видна как ссылка (ADR-0133)', () => {
    stubField();
    render(
      <Harness
        value={{ videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }}
        fileStorageEnabled
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Смотреть здесь' })).toBeInTheDocument();
  });

  it('«Убрать видео» зовёт clear()', async () => {
    const { clear } = stubField();
    render(<Harness value={{ videoId: 'vid1' }} fileStorageEnabled onChange={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать видео' }));

    expect(clear).toHaveBeenCalled();
  });
});

describe('useVideoAttach — пусто, R2 подключён', () => {
  it('пункт «Видео» открывает выбор файла — клик по скрытому input', async () => {
    stubField();
    render(<Harness value={{}} fileStorageEnabled onChange={vi.fn()} />);
    const input = screen.getByLabelText('Видео вопроса');
    const clickSpy = vi.spyOn(input, 'click');

    await userEvent.click(screen.getByRole('button', { name: 'Видео' }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Ссылка на видео (YouTube)')).not.toBeInTheDocument();
  });

  it('выбор файла зовёт uploadFile()', async () => {
    const { uploadFile } = stubField();
    render(<Harness value={{}} fileStorageEnabled onChange={vi.fn()} />);
    const file = new File(['видео'], 'clip.mp4', { type: 'video/mp4' });

    await userEvent.upload(screen.getByLabelText('Видео вопроса'), file);

    expect(uploadFile).toHaveBeenCalledWith(file);
  });

  it('выбор отменён (файла нет) — uploadFile() не зовётся', () => {
    const { uploadFile } = stubField();
    render(<Harness value={{}} fileStorageEnabled onChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Видео вопроса'), { target: { files: [] } });

    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('pending — «Загружаем…» не мешает выбрать файл повторно (input остаётся)', () => {
    stubField({ uploadPending: true });
    render(<Harness value={{}} fileStorageEnabled onChange={vi.fn()} />);

    expect(screen.getByLabelText('Видео вопроса')).toBeInTheDocument();
  });

  it('идёт загрузка — процент и просьба не закрывать страницу', () => {
    stubField({ uploadPending: true, uploadProgress: 0.42 });
    render(<Harness value={{}} fileStorageEnabled onChange={vi.fn()} />);

    expect(screen.getByText('Загружаем… 42 %')).toBeInTheDocument();
    expect(screen.getByText(/Не закрывайте страницу/)).toBeInTheDocument();
  });

  it('error загрузки — текст сбоя виден', () => {
    stubField({
      error: 'Такой формат не подходит. Загрузите видео в MP4, MOV или WebM.',
    });
    render(<Harness value={{}} fileStorageEnabled onChange={vi.fn()} />);

    expect(
      screen.getByText('Такой формат не подходит. Загрузите видео в MP4, MOV или WebM.'),
    ).toBeInTheDocument();
  });
});

describe('useVideoAttach — пусто, R2 не подключён', () => {
  it('пункт «Видео» открывает поле ссылки, а не выбор файла', async () => {
    stubField();
    render(<Harness value={{}} fileStorageEnabled={false} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('Видео вопроса')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Видео' }));

    expect(screen.getByLabelText('Видео вопроса')).toHaveAttribute('type', 'url');
  });

  it('уход с поля непустой ссылки зовёт commitUrl()', async () => {
    const { setUrlDraft, commitUrl } = stubField({ urlDraft: 'https://youtu.be/x' });
    render(<Harness value={{}} fileStorageEnabled={false} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Видео' }));

    const input = screen.getByLabelText('Видео вопроса');
    await userEvent.type(input, 'x');
    input.blur();

    expect(setUrlDraft).toHaveBeenCalled();
    expect(commitUrl).toHaveBeenCalled();
  });

  it('уход с пустого поля ссылки — commitUrl() не зовётся', async () => {
    const { commitUrl } = stubField({ urlDraft: '  ' });
    render(<Harness value={{}} fileStorageEnabled={false} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Видео' }));

    fireEvent.blur(screen.getByLabelText('Видео вопроса'));

    expect(commitUrl).not.toHaveBeenCalled();
  });

  it('error ссылки — виден под полем', async () => {
    stubField({ error: 'Ссылка должна начинаться с https://.' });
    render(<Harness value={{}} fileStorageEnabled={false} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Видео' }));

    expect(screen.getByText('Ссылка должна начинаться с https://.')).toBeInTheDocument();
  });
});
