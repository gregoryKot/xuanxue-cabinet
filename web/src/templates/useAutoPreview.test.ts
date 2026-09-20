// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts») — useAutoPreview
// вызывает его через usePreview.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LessonDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useAutoPreview } from './useAutoPreview';

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
    tags: [],
    recordings: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useAutoPreview — автовыбор занятия', () => {
  it('занятие подставляется само — первое из списка, без ручного выбора', async () => {
    mockedApiFetch.mockResolvedValue({ text: 'пост' });
    const { result } = renderHook(() =>
      useAutoPreview(
        'lesson_link',
        [makeLesson({ id: 'l1' }), makeLesson({ id: 'l2' })],
        'текст',
        false,
      ),
    );

    await waitFor(() => expect(result.current.lessonId).toBe('l1'));
  });

  it('учитель выбрал занятие сам — автовыбор больше его не переопределяет', () => {
    const { result, rerender } = renderHook(
      ({ lessons }: { lessons: LessonDto[] }) =>
        useAutoPreview('lesson_link', lessons, 'текст', false),
      { initialProps: { lessons: [makeLesson({ id: 'l1' })] } },
    );

    act(() => result.current.setLessonId('l2'));
    expect(result.current.lessonId).toBe('l2');

    rerender({ lessons: [makeLesson({ id: 'l1' }), makeLesson({ id: 'l3' })] });
    expect(result.current.lessonId).toBe('l2');
  });
});

describe('useAutoPreview — автозапуск предпросмотра', () => {
  it('есть занятие и нет несохранённых правок — предпросмотр приходит без нажатия кнопки', async () => {
    mockedApiFetch.mockResolvedValueOnce({ text: 'Через 30 минут занятие' });
    const { result } = renderHook(() =>
      useAutoPreview('lesson_link', [makeLesson()], 'текст', false),
    );

    await waitFor(() =>
      expect(result.current.preview.result).toEqual({ text: 'Через 30 минут занятие' }),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith('/settings/preview', {
      method: 'POST',
      body: { kind: 'lesson_link', lessonId: 'l1' },
    });
  });

  it('несохранённые правки — автозапроса нет', async () => {
    renderHook(() => useAutoPreview('lesson_link', [makeLesson()], 'текст', true));

    // Даём микрозадачам отработать: если бы запрос ушёл, apiFetch был бы вызван.
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('после успешного сохранения (новый savedText) — новый автозапрос', async () => {
    mockedApiFetch.mockResolvedValue({ text: 'пост' });
    const { rerender } = renderHook(
      ({ savedText }: { savedText: string }) =>
        useAutoPreview('lesson_link', [makeLesson()], savedText, false),
      { initialProps: { savedText: 'старый' } },
    );

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledTimes(1));

    rerender({ savedText: 'новый' });

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledTimes(2));
  });

  it('тот же занятие+сохранённый текст на ре-рендерах — запрос не повторяется', async () => {
    mockedApiFetch.mockResolvedValue({ text: 'пост' });
    const { rerender } = renderHook(
      ({ savedText }: { savedText: string }) =>
        useAutoPreview('lesson_link', [makeLesson()], savedText, false),
      { initialProps: { savedText: 'текст' } },
    );

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledTimes(1));

    rerender({ savedText: 'текст' });
    rerender({ savedText: 'текст' });

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('сбой предпросмотра виден через preview.error', async () => {
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Занятие не найдено.', 404, 'not_found'),
    );

    const { result } = renderHook(() =>
      useAutoPreview('lesson_link', [makeLesson()], 'текст', false),
    );

    await waitFor(() => expect(result.current.preview.error).toBe('Занятие не найдено.'));
  });
});
