// Черновик (ADR-0052, дополнение 2026-09-21) пишется в реальный localStorage
// под ключом lesson:<id>/lesson:new — очищаем между тестами, иначе черновик
// одного теста восстановился бы в соседнем (id занятия в makeLesson() один
// и тот же).
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassDto, LessonDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { readDraft } from '../lib/formDraft';
import { useLessonForm } from './useLessonForm';

afterEach(() => {
  localStorage.clear();
});

function makeLesson(overrides: Partial<LessonDto> = {}): LessonDto {
  return {
    id: 'l1',
    classId: 'c1',
    startsAt: '2026-09-08T16:00:00.000Z',
    durationMin: 60,
    topic: 'Тема',
    status: 'scheduled',
    tags: [],
    recordings: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const CLASSES: ClassDto[] = [
  {
    id: 'c1',
    title: 'Тайцзицюань',
    groupLabel: '',
    format: 'online',
    rules: [],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

describe('useLessonForm — submit()', () => {
  it('невалидная форма — validationError, onCreate/onUpdate не зовутся', async () => {
    const onCreate = vi.fn();
    const { result } = renderHook(() => useLessonForm(null, CLASSES, onCreate, vi.fn()));

    let ok = true;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(false);
    expect(result.current.validationError).toMatch(/дату и время/);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('создание — валидная форма зовёт onCreate, true', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useLessonForm(null, CLASSES, onCreate, vi.fn()));

    act(() => {
      result.current.setField('startsAtLocal', '2026-09-08T19:00');
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(true);
    expect(onCreate).toHaveBeenCalled();
  });

  it('правка — ApiError при сохранении — serverError с деталями, false', async () => {
    const onUpdate = vi
      .fn()
      .mockRejectedValue(
        new ApiError('Проверьте поля.', 400, 'invalid_input', ['topic: длинновато']),
      );
    const { result } = renderHook(() =>
      useLessonForm(makeLesson(), [], vi.fn(), onUpdate),
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(false);
    expect(result.current.serverError?.details).toEqual(['topic: длинновато']);
  });

  it('правка — не-ApiError сбой — общий текст, false', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useLessonForm(makeLesson(), [], vi.fn(), onUpdate),
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(false);
    expect(result.current.serverError?.message).toBe(
      'Не удалось сохранить. Попробуйте ещё раз.',
    );
  });
});

describe('useLessonForm — cancelLesson/restoreLesson без занятия (создание)', () => {
  it('lessonDto === null — cancelLesson/restoreLesson не зовут onUpdate, отдают false', async () => {
    const onUpdate = vi.fn();
    const { result } = renderHook(() => useLessonForm(null, [], vi.fn(), onUpdate));

    let cancelled = true;
    await act(async () => {
      cancelled = await result.current.cancelLesson();
    });
    expect(cancelled).toBe(false);

    let restored = true;
    await act(async () => {
      restored = await result.current.restoreLesson();
    });
    expect(restored).toBe(false);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('useLessonForm — cancelLesson/restoreLesson сбой', () => {
  it('ApiError при отмене — serverError с текстом сервера, false', async () => {
    const onUpdate = vi
      .fn()
      .mockRejectedValue(new ApiError('Занятие уже отменено.', 409, 'conflict'));
    const { result } = renderHook(() =>
      useLessonForm(makeLesson(), [], vi.fn(), onUpdate),
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.cancelLesson();
    });

    expect(ok).toBe(false);
    expect(result.current.serverError?.message).toBe('Занятие уже отменено.');
  });

  it('не-ApiError при отмене — текст про отмену, false', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useLessonForm(makeLesson(), [], vi.fn(), onUpdate),
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.cancelLesson();
    });

    expect(ok).toBe(false);
    expect(result.current.serverError?.message).toBe(
      'Не удалось отменить занятие. Попробуйте ещё раз.',
    );
  });

  it('не-ApiError при возврате в расписание — общий текст, false', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useLessonForm(makeLesson({ status: 'cancelled' }), [], vi.fn(), onUpdate),
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.restoreLesson();
    });

    expect(ok).toBe(false);
    expect(result.current.serverError?.message).toBe(
      'Не удалось вернуть занятие в расписание. Попробуйте ещё раз.',
    );
  });

  it('успешная отмена — true, статус занятия уходит PATCH-ем', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useLessonForm(makeLesson(), [], vi.fn(), onUpdate),
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.cancelLesson();
    });

    expect(ok).toBe(true);
    expect(onUpdate).toHaveBeenCalledWith('l1', { status: 'cancelled' });
  });
});

// Сама механика черновика (восстановление, dirty, beforeunload) проверена в
// hooks/useFormDraft.test.ts — здесь только то, что форма занятия реально
// его подключает и снимает при успехе (аудит 2026-09-21, HIGH — раньше
// useLessonForm не был защищён вовсе, случайный «Назад» стирал тему занятия
// и ссылку на запись молча).
describe('useLessonForm — черновик (ADR-0052, дополнение 2026-09-21)', () => {
  it('ввёл тему → размонтировал → смонтировал заново → значение на месте', () => {
    const first = renderHook(() => useLessonForm(null, CLASSES, vi.fn(), vi.fn()));
    act(() => first.result.current.setField('topic', 'Черновик темы'));
    first.unmount();

    const second = renderHook(() => useLessonForm(null, CLASSES, vi.fn(), vi.fn()));

    expect(second.result.current.state.topic).toBe('Черновик темы');
    expect(second.result.current.draftRestored).toBe(true);
  });

  it('успешный submit — черновик снят', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useLessonForm(null, CLASSES, onCreate, vi.fn()));
    act(() => result.current.setField('startsAtLocal', '2026-09-08T19:00'));

    await act(async () => {
      await result.current.submit();
    });

    expect(readDraft('lesson:new', Date.now())).toBeNull();
  });

  it('успешная отмена занятия — черновик снят', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const lesson = makeLesson();
    const { result } = renderHook(() => useLessonForm(lesson, [], vi.fn(), onUpdate));
    act(() => result.current.setField('topic', 'Правка перед отменой'));

    await act(async () => {
      await result.current.cancelLesson();
    });

    expect(readDraft(`lesson:${lesson.id}`, Date.now())).toBeNull();
  });

  it('непустой черновик — beforeunload отменяет событие', () => {
    const { result } = renderHook(() => useLessonForm(null, CLASSES, vi.fn(), vi.fn()));
    act(() => result.current.setField('topic', 'Тема'));

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
