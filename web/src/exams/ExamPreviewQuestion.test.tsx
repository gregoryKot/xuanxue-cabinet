// Предпросмотр «глазами ученика» показывает сохранённый экзамен, отвечать в
// нём нельзя (ТЗ 4.3): поля ответа выключены, а событие ввода, если оно всё
// же долетело (клавиатура на уже сфокусированном поле, программный dispatch),
// ничего не меняет — значение остаётся пустым. ExamPreviewScreen.test.tsx
// проверяет только `disabled`; здесь — что и сам ввод глотается.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AuthConfigDto, ExamItemDto } from '@xuanxue/shared';
import { ExamPreviewQuestion } from './ExamPreviewQuestion';
import { previewVideoControls } from './previewVideoControls';

// Хранилище файлов и бот включены — у видео-вопроса виден весь блок ученика.
const FULL_CONFIG: AuthConfigDto = {
  emailLoginEnabled: true,
  fileStorageEnabled: true,
  googleLoginEnabled: false,
  telegramBotUsername: 'xuanxue_bot',
};
const FULL_VIDEO = previewVideoControls(FULL_CONFIG);

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'i1',
    kind: 'text',
    prompt: 'Опишите принцип песчинки',
    options: [],
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

describe('ExamPreviewQuestion — поля не принимают ввод', () => {
  it('text — ввод и уход с поля не меняют значение, поле остаётся пустым и выключенным', () => {
    render(<ExamPreviewQuestion index={0} item={makeItem()} video={FULL_VIDEO} />);

    const textarea = screen.getByRole('textbox', { name: 'Опишите принцип песчинки' });
    fireEvent.change(textarea, { target: { value: 'мой ответ' } });
    fireEvent.blur(textarea);

    expect(textarea).toBeDisabled();
    expect(textarea).toHaveValue('');
  });

  it('single — переключатели выключены, клик не отмечает вариант', () => {
    render(
      <ExamPreviewQuestion
        index={1}
        item={makeItem({
          id: 'i2',
          kind: 'single',
          options: [
            { id: 'o1', text: '24', correct: true },
            { id: 'o2', text: '108', correct: false },
          ],
        })}
        video={FULL_VIDEO}
      />,
    );

    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0] as HTMLElement);

    radios.forEach((radio) => {
      expect(radio).toBeDisabled();
      expect(radio).not.toBeChecked();
    });
  });

  it('вопрос удалён из списка (item нет) — подпись «недоступен» вместо поля ответа', () => {
    render(<ExamPreviewQuestion index={2} video={FULL_VIDEO} />);

    expect(screen.getByText(/Вопрос недоступен/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

// Видео-вопрос в предпросмотре — тот же блок, что у ученика
// (attempt/AttemptQuestionVideo.tsx), только неактивный (отзыв владельца
// 2026-10-02: раньше здесь была одна строка вместо всего блока).
describe('ExamPreviewQuestion — видео-вопрос показывает блок ученика', () => {
  const videoItem = makeItem({ id: 'v1', kind: 'video', prompt: 'Покажите форму' });

  it('хранилище и бот есть — весь блок на месте, но ничего не отправить', () => {
    render(<ExamPreviewQuestion index={0} item={videoItem} video={FULL_VIDEO} />);

    expect(screen.getByText('Ответ на этот вопрос — видео.')).toBeInTheDocument();
    expect(screen.getByLabelText('Загрузить видео')).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Ссылка на видео' })).toBeDisabled();
    // Та же кнопка, но не ссылка: бот не откроется с выдуманным номером попытки.
    expect(screen.getByText('Открыть чат с ботом')).not.toHaveAttribute('href');
    expect(
      screen.getByRole('button', {
        name: 'Как выложить видео, чтобы учитель его открыл',
      }),
    ).toBeInTheDocument();
  });

  it('конфигурации входа нет — загрузки и бота нет, поле ссылки на месте и выключено', () => {
    render(
      <ExamPreviewQuestion
        index={0}
        item={videoItem}
        video={previewVideoControls(null)}
      />,
    );

    expect(screen.queryByLabelText('Загрузить видео')).not.toBeInTheDocument();
    expect(screen.queryByText('Открыть чат с ботом')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Ссылка на видео' })).toBeDisabled();
  });
});

// Отзыв владельца 2026-10-02, «как за белой занавеской»: показ без права
// ответить приглушал плитки с видео и фото (opacity 0.6 на всей плитке).
// Предпросмотр обязан выглядеть так же, как экран ученика, — никакого
// приглушения ни у одного элемента ни у одного типа вопроса.
describe('ExamPreviewQuestion — без «белой занавески»', () => {
  const videoOptions = [
    { id: 'o1', text: '1', correct: true, videoId: 'v1' },
    { id: 'o2', text: '2', correct: false, videoId: 'v2' },
  ];
  const imageOptions = [
    { id: 'o1', text: '', correct: true, imageId: 'img1' },
    { id: 'o2', text: '', correct: false, imageId: 'img2' },
  ];
  const textOptions = [
    { id: 'o1', text: '24', correct: true },
    { id: 'o2', text: '108', correct: false },
  ];
  const cases: Array<[string, Partial<ExamItemDto>]> = [
    [
      'single с видео-вариантами и объяснением',
      { kind: 'single', options: videoOptions, askReason: true },
    ],
    ['single с текстовыми вариантами', { kind: 'single', options: textOptions }],
    ['multiple с вариантами-картинками', { kind: 'multiple', options: imageOptions }],
    ['text', { kind: 'text' }],
    ['video', { kind: 'video' }],
  ];

  it.each(cases)('%s — ни у одного элемента нет inline opacity', (_name, overrides) => {
    const { container } = render(
      <ExamPreviewQuestion index={0} item={makeItem(overrides)} video={FULL_VIDEO} />,
    );

    const faded = Array.from(container.querySelectorAll<HTMLElement>('*'))
      // Скрытый `<input type="file">` прозрачен намеренно (FilePickerButton.tsx):
      // это не видимое приглушение, а способ спрятать нативный контрол.
      .filter((element) => !element.matches('input[type="file"]'))
      .filter((element) => !['', '1'].includes(element.style.opacity));

    expect(faded).toEqual([]);
  });
});
