// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts») — TemplateEditor
// вызывает его через usePreview.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TEMPLATES, type LessonDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { TemplateEditor } from './TemplateEditor';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

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
    recordings: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
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

describe('TemplateEditor — выбор занятия и предпросмотр', () => {
  it('несохранённые правки — предупреждение, предпросмотр недоступен', () => {
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
    expect(screen.getByRole('button', { name: 'Показать предпросмотр' })).toBeDisabled();
  });

  it('без выбранного занятия предпросмотр недоступен', () => {
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

    expect(screen.getByRole('button', { name: 'Показать предпросмотр' })).toBeDisabled();
  });

  it('выбор занятия и клик — POST /settings/preview, результат на экране', async () => {
    const user = userEvent.setup();
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

    await user.selectOptions(screen.getByLabelText('Предпросмотр на занятии'), 'l1');
    await user.click(screen.getByRole('button', { name: 'Показать предпросмотр' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/settings/preview', {
      method: 'POST',
      body: { kind: 'lesson_link', lessonId: 'l1' },
    });
    expect(
      await screen.findByText('Через 30 минут занятие', { selector: 'pre' }),
    ).toBeInTheDocument();
  });

  it('recordingIsStandIn — пометка под предпросмотром', async () => {
    const user = userEvent.setup();
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

    await user.selectOptions(screen.getByLabelText('Предпросмотр на занятии'), 'l1');
    await user.click(screen.getByRole('button', { name: 'Показать предпросмотр' }));

    expect(await screen.findByText(/Записи у занятия ещё нет/)).toBeInTheDocument();
  });

  it('сбой предпросмотра — текст ошибки', async () => {
    const user = userEvent.setup();
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

    await user.selectOptions(screen.getByLabelText('Предпросмотр на занятии'), 'l1');
    await user.click(screen.getByRole('button', { name: 'Показать предпросмотр' }));

    await waitFor(() =>
      expect(screen.getByText('Занятие не найдено.')).toBeInTheDocument(),
    );
  });

  it('темы у занятия нет — плейсхолдер в списке выбора', () => {
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
  });
});

describe('TemplateEditor — бейдж пояса школы (pr-k3-fixes.md п.22)', () => {
  it('пояс школы отличается от браузерного — бейдж рядом со временем занятия', () => {
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
    expect(screen.getByRole('button', { name: 'Показать предпросмотр' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));
    expect(onRetryLessons).toHaveBeenCalledTimes(1);
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
