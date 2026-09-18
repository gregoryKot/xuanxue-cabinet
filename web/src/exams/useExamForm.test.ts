// Валидация и сборка тела запроса — в examFormInput.test.ts, орекстрация
// (submit/remove/changeStatus) — в hooks/useEntityForm.test.ts. Здесь —
// только конкретная связка для домена формы экзамена, по образцу
// exam-items/useExamItemForm.test.ts. Черновик (ADR-0046) пишется в реальный
// localStorage под ключом exam:<id>/exam:new — очищаем между тестами, иначе
// черновик одного теста восстановился бы в соседнем (id экзамена в
// makeExam() один и тот же).
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExamDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { readDraft } from '../lib/formDraft';
import { useExamForm } from './useExamForm';

afterEach(() => {
  localStorage.clear();
});

function makeExam(overrides: Partial<ExamDto> = {}): ExamDto {
  return {
    id: 'x1',
    title: 'Экзамен',
    description: '',
    level: '',
    blocks: [],
    shuffleOptions: false,
    attemptsAllowed: 1,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useExamForm — создание', () => {
  it('пустое название — submit не вызывает onCreate, есть validationError', async () => {
    const onCreate = vi.fn();
    const { result } = renderHook(() => useExamForm(null, onCreate, vi.fn(), vi.fn()));

    await act(async () => {
      await result.current.submit();
    });

    expect(onCreate).not.toHaveBeenCalled();
    expect(result.current.validationError).toMatch(/название/);
  });

  it('успешный submit — вызывает onCreate с телом из состояния', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useExamForm(null, onCreate, vi.fn(), vi.fn()));

    act(() => result.current.setField('title', '  Экзамен  '));

    let ok = false;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(true);
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Экзамен' }));
  });

  it('ApiError от onCreate — serverError с деталями', async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValue(new ApiError('Конфликт', 409, 'conflict', ['подробность']));
    const { result } = renderHook(() => useExamForm(null, onCreate, vi.fn(), vi.fn()));

    act(() => result.current.setField('title', 'Экзамен'));
    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.serverError).toEqual({
      message: 'Конфликт',
      details: ['подробность'],
    });
  });
});

describe('useExamForm — правка, удаление, смена статуса', () => {
  it('submit существующего экзамена вызывает onUpdate с его id', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const exam = makeExam();
    const { result } = renderHook(() => useExamForm(exam, vi.fn(), onUpdate, vi.fn()));

    await act(async () => {
      await result.current.submit();
    });

    expect(onUpdate).toHaveBeenCalledWith(
      'x1',
      expect.objectContaining({ title: 'Экзамен' }),
    );
  });

  it('remove() без выбранного экзамена — false, onRemove не вызывается', async () => {
    const onRemove = vi.fn();
    const { result } = renderHook(() => useExamForm(null, vi.fn(), vi.fn(), onRemove));

    let ok = true;
    await act(async () => {
      ok = await result.current.remove();
    });

    expect(ok).toBe(false);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('changeStatus() отправляет несохранённые правки формы вместе со статусом', async () => {
    // Блокер аудита 2026-09-15 №1: «Опубликовать» с новым лимитом времени
    // должен нести этот лимит на сервер, а не только { status }.
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const exam = makeExam();
    const { result } = renderHook(() => useExamForm(exam, vi.fn(), onUpdate, vi.fn()));

    act(() => result.current.setField('timeLimitMinText', '45'));

    let ok = false;
    await act(async () => {
      ok = await result.current.changeStatus('published');
    });

    expect(ok).toBe(true);
    expect(onUpdate).toHaveBeenCalledWith(
      'x1',
      expect.objectContaining({ timeLimitMin: 45, status: 'published' }),
    );
  });

  it('ошибка changeStatus() — сообщение сервера в serverError (ТЗ 4.3: показывать как есть)', async () => {
    const onUpdate = vi
      .fn()
      .mockRejectedValue(
        new ApiError('В форме нет ни одного вопроса.', 400, 'invalid_input'),
      );
    const exam = makeExam();
    const { result } = renderHook(() => useExamForm(exam, vi.fn(), onUpdate, vi.fn()));

    await act(async () => {
      await result.current.changeStatus('published');
    });

    expect(result.current.serverError?.message).toBe('В форме нет ни одного вопроса.');
  });
});

describe('useExamForm — ключ черновика (ADR-0046)', () => {
  it('новый экзамен — ключ exam:new', () => {
    const { result } = renderHook(() => useExamForm(null, vi.fn(), vi.fn(), vi.fn()));

    act(() => result.current.setField('title', 'Черновик'));

    expect(readDraft('exam:new', Date.now())).toEqual(
      expect.objectContaining({ title: 'Черновик' }),
    );
  });

  it('существующий экзамен — ключ exam:<id>', () => {
    const exam = makeExam({ id: 'x42' });
    const { result } = renderHook(() => useExamForm(exam, vi.fn(), vi.fn(), vi.fn()));

    act(() => result.current.setField('title', 'Правка'));

    expect(readDraft('exam:x42', Date.now())).toEqual(
      expect.objectContaining({ title: 'Правка' }),
    );
  });
});
