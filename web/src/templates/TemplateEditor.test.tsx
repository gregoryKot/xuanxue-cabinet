// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts») — TemplateEditor
// вызывает его через useAutoPreview → usePreview.
import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TEMPLATES, type LessonDto, type TemplateKind } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { TemplateEditor } from './TemplateEditor';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

// «Пояс школы отличается от браузерного» ниже — проверяемое условие, а не
// везение: пояс зрителя задан явно (test-support/viewerTimeZone.ts).
stubViewerTimeZone();

beforeEach(() => {
  // Дефолт для тестов, которым сам факт автозапроса не важен — без него
  // необработанный промис после теста сыпал бы предупреждениями act().
  mockedApiFetch.mockResolvedValue({ text: 'предпросмотр' });
});

afterEach(() => {
  mockedApiFetch.mockReset();
});

function makeLesson(overrides: Partial<LessonDto> = {}): LessonDto {
  return {
    id: 'l1',
    classId: 'c1',
    startsAt: '2026-09-08T16:00:00Z',
    durationMin: 60,
    topic: 'Форма 24',
    status: 'scheduled',
    tags: [],
    recordings: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// Управляемая обёртка для тестов вставки чипом: text/savedText держит сама,
// как TemplatesScreen.tsx.
function ControlledEditor({
  kind,
  initialText = '',
  lessons = [],
}: {
  kind: TemplateKind;
  initialText?: string;
  lessons?: LessonDto[];
}) {
  const [text, setText] = useState(initialText);
  return (
    <TemplateEditor
      kind={kind}
      text={text}
      savedText={text}
      onChange={setText}
      lessons={lessons}
      lessonsError={null}
      onRetryLessons={vi.fn()}
    />
  );
}

describe('TemplateEditor — текст и валидация', () => {
  it('показывает заголовок вида шаблона и текущий текст', () => {
    render(
      <TemplateEditor
        kind="lesson_link"
        text="Через {минут} минут"
        savedText="Через {минут} минут"
        onChange={vi.fn()}
        lessons={[]}
        lessonsError={null}
        onRetryLessons={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Анонс занятия' })).toBeInTheDocument();
    expect(screen.getByLabelText('Текст шаблона')).toHaveValue('Через {минут} минут');
  });

  it('неизвестный плейсхолдер — ошибка под textarea', () => {
    render(
      <TemplateEditor
        kind="lesson_link"
        text="Привет {дата}"
        savedText="Привет {дата}"
        onChange={vi.fn()}
        lessons={[]}
        lessonsError={null}
        onRetryLessons={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('{дата}');
  });

  it('ввод в textarea вызывает onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TemplateEditor
        kind="lesson_link"
        text=""
        savedText=""
        onChange={onChange}
        lessons={[]}
        lessonsError={null}
        onRetryLessons={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Текст шаблона'), 'x');

    expect(onChange).toHaveBeenCalledWith('x');
  });

  it('«Сбросить» возвращает текст по умолчанию для своего kind', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TemplateEditor
        kind="recording"
        text="что-то своё"
        savedText="что-то своё"
        onChange={onChange}
        lessons={[]}
        lessonsError={null}
        onRetryLessons={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Сбросить к тексту по умолчанию' }),
    );

    expect(onChange).toHaveBeenCalledWith(DEFAULT_TEMPLATES.recording);
  });
});

describe('TemplateEditor — вставка подстановки по клику (отзыв владельца 2026-09-08)', () => {
  it('клик по чипу вставляет {имя} в позицию курсора и возвращает фокус в textarea', async () => {
    const user = userEvent.setup();
    render(<ControlledEditor kind="lesson_link" initialText="Привет мир" />);

    const textarea = screen.getByLabelText<HTMLTextAreaElement>('Текст шаблона');
    await user.click(textarea);
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    await user.click(screen.getByRole('button', { name: '{тема}' }));

    await waitFor(() => expect(textarea).toHaveValue('Привет мир{тема}'));
    expect(textarea).toHaveFocus();
    expect(textarea.selectionStart).toBe('Привет мир{тема}'.length);
  });

  it('пояснения к подстановкам открываются списком, не нажимая чип', async () => {
    const user = userEvent.setup();
    render(<ControlledEditor kind="lesson_link" />);

    await user.click(screen.getByText('Что подставится в пост'));

    expect(screen.getByText(/Ссылка на Zoom/)).toBeInTheDocument();
  });
});

describe('TemplateEditor — выбор занятия и предпросмотр', () => {
  it('несохранённые правки — предупреждение, автозапроса нет, кнопка недоступна', async () => {
    render(
      <TemplateEditor
        kind="lesson_link"
        text="новый текст"
        savedText="старый текст"
        onChange={vi.fn()}
        lessons={[makeLesson()]}
        lessonsError={null}
        onRetryLessons={vi.fn()}
      />,
    );

    expect(screen.getByText(/Сначала сохраните/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Обновить предпросмотр' })).toBeDisabled();

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('нет занятий — автовыбора нет, предпросмотр недоступен', () => {
    render(
      <TemplateEditor
        kind="lesson_link"
        text="текст"
        savedText="текст"
        onChange={vi.fn()}
        lessons={[]}
        lessonsError={null}
        onRetryLessons={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Обновить предпросмотр' })).toBeDisabled();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('занятие подставляется само, предпросмотр приходит без нажатия кнопки', async () => {
    mockedApiFetch.mockResolvedValueOnce({ text: 'Через 30 минут занятие' });

    render(
      <TemplateEditor
        kind="lesson_link"
        text="текст"
        savedText="текст"
        onChange={vi.fn()}
        lessons={[makeLesson()]}
        lessonsError={null}
        onRetryLessons={vi.fn()}
      />,
    );

    expect(await screen.findByLabelText('Предпросмотр на занятии')).toHaveValue('l1');
    // objectContaining — вызов несёт ещё и signal (usePreview.ts, requestId +
    // AbortController, аудит 2026-09-21), сверять его отдельным значением незачем.
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/settings/preview',
      expect.objectContaining({
        method: 'POST',
        body: { kind: 'lesson_link', lessonId: 'l1' },
      }),
    );
    expect(
      await screen.findByText('Через 30 минут занятие', { selector: 'pre' }),
    ).toBeInTheDocument();
  });

  it('recordingIsStandIn — пометка под предпросмотром', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      text: 'Тема занятия',
      recordingIsStandIn: true,
    });

    render(
      <TemplateEditor
        kind="recording"
        text="текст"
        savedText="текст"
        onChange={vi.fn()}
        lessons={[makeLesson()]}
        lessonsError={null}
        onRetryLessons={vi.fn()}
      />,
    );

    expect(await screen.findByText(/Записи у занятия ещё нет/)).toBeInTheDocument();
  });

  it('сбой предпросмотра — текст ошибки виден без нажатия кнопки', async () => {
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Занятие не найдено.', 404, 'not_found'),
    );

    render(
      <TemplateEditor
        kind="lesson_link"
        text="текст"
        savedText="текст"
        onChange={vi.fn()}
        lessons={[makeLesson()]}
        lessonsError={null}
        onRetryLessons={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('Занятие не найдено.')).toBeInTheDocument(),
    );
  });

  it('«Обновить предпросмотр» повторяет запрос по клику', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue({ text: 'Через 30 минут занятие' });

    render(
      <TemplateEditor
        kind="lesson_link"
        text="текст"
        savedText="текст"
        onChange={vi.fn()}
        lessons={[makeLesson()]}
        lessonsError={null}
        onRetryLessons={vi.fn()}
      />,
    );

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Обновить предпросмотр' }));

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledTimes(2));
  });

  it('смена занятия в списке — предпросмотр перезапрашивается для него', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue({ text: 'Через 30 минут занятие' });

    render(
      <TemplateEditor
        kind="lesson_link"
        text="текст"
        savedText="текст"
        onChange={vi.fn()}
        lessons={[makeLesson(), makeLesson({ id: 'l2', topic: 'Толкающие руки' })]}
        lessonsError={null}
        onRetryLessons={vi.fn()}
      />,
    );

    // Автовыбор взял ближайшее (первое) занятие и сам сходил за предпросмотром.
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledTimes(1));

    await user.selectOptions(screen.getByRole('combobox'), 'l2');

    // objectContaining — вызов несёт ещё и signal (usePreview.ts, requestId +
    // AbortController, аудит 2026-09-21), сверять его отдельным значением незачем.
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenLastCalledWith(
        '/settings/preview',
        expect.objectContaining({
          method: 'POST',
          body: { kind: 'lesson_link', lessonId: 'l2' },
        }),
      ),
    );
  });

  it('темы у занятия нет — плейсхолдер в списке выбора', async () => {
    render(
      <TemplateEditor
        kind="lesson_link"
        text="текст"
        savedText="текст"
        onChange={vi.fn()}
        lessons={[makeLesson({ topic: '' })]}
        lessonsError={null}
        onRetryLessons={vi.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: /Тема не задана/ })).toBeInTheDocument();
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
  });
});

describe('TemplateEditor — бейдж пояса школы (pr-k3-fixes.md п.22)', () => {
  it('пояс школы отличается от браузерного — бейдж рядом со временем занятия', async () => {
    render(
      <TemplateEditor
        kind="lesson_link"
        text="текст"
        savedText="текст"
        onChange={vi.fn()}
        lessons={[makeLesson()]}
        lessonsError={null}
        onRetryLessons={vi.fn()}
        schoolTz="Pacific/Kiritimati"
      />,
    );

    expect(
      screen.getByRole('option', { name: /Pacific\/Kiritimati/ }),
    ).toBeInTheDocument();
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
  });
});

describe('TemplateEditor — ошибка загрузки занятий (pr-k3-fixes.md п.2)', () => {
  it('LoadErrorBanner с повтором вместо выбора занятия, предпросмотр недоступен', async () => {
    const user = userEvent.setup();
    const onRetryLessons = vi.fn();
    render(
      <TemplateEditor
        kind="lesson_link"
        text="текст"
        savedText="текст"
        onChange={vi.fn()}
        lessons={[]}
        lessonsError="Не удалось загрузить занятия для предпросмотра."
        onRetryLessons={onRetryLessons}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить занятия для предпросмотра.',
    );
    expect(screen.queryByLabelText('Предпросмотр на занятии')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Обновить предпросмотр' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));
    expect(onRetryLessons).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe('TemplateEditor — serverError (pr-k3-fixes.md п.5)', () => {
  it('показывает переданную ошибку сервера под своим редактором', () => {
    render(
      <TemplateEditor
        kind="recording"
        text="текст"
        savedText="текст"
        onChange={vi.fn()}
        lessons={[]}
        lessonsError={null}
        onRetryLessons={vi.fn()}
        serverError="В шаблоне «Пост с записью» неизвестные подстановки: {дата}."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'В шаблоне «Пост с записью» неизвестные подстановки: {дата}.',
    );
  });
});
