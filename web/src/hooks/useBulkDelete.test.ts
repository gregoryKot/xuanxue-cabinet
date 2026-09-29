// Хук в изоляции (тот же приём, что useConfirmedRemove.test.ts) — apiFetch
// замокан напрямую, без DOM и без ConfirmDialog/DialogShell вокруг: тот
// диалог проверяет ExamItemsScreen.bulk.test.tsx/ExamsScreen.bulk.test.tsx
// на живом дереве.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useBulkDelete } from './useBulkDelete';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function setup(visibleIds: string[] = ['a', 'b']) {
  const onDeleted = vi.fn();
  const view = renderHook(() =>
    useBulkDelete({ collection: '/exam-items', visibleIds, onDeleted }),
  );
  return { ...view, onDeleted };
}

describe('useBulkDelete — выбор', () => {
  it('start() входит в режим выбора, requestDelete()/cancelDelete() не трогают apiFetch', () => {
    const { result } = setup();

    act(() => result.current.start());
    expect(result.current.isSelecting).toBe(true);

    act(() => result.current.requestDelete());
    expect(result.current.confirming).toBe(true);

    act(() => result.current.cancelDelete());
    expect(result.current.confirming).toBe(false);
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('start() после предыдущего запроса стирает result и error', async () => {
    mockedApiFetch.mockResolvedValue({ deletedIds: ['a'], failed: [] });
    const { result } = setup();
    act(() => result.current.toggle('a'));
    await act(() => result.current.confirmDelete());
    expect(result.current.result).not.toBeNull();

    act(() => result.current.start());

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('useBulkDelete — confirmDelete успешный, без отказов', () => {
  it('POST на bulkDeletePath с отмеченными id, onDeleted(deletedIds), выход из режима выбора', async () => {
    mockedApiFetch.mockResolvedValue({ deletedIds: ['a', 'b'], failed: [] });
    const { result, onDeleted } = setup(['a', 'b']);

    act(() => result.current.start());
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('b'));

    await act(() => result.current.confirmDelete());

    expect(mockedApiFetch).toHaveBeenCalledWith('/exam-items/bulk-delete', {
      method: 'POST',
      body: { ids: ['a', 'b'] },
    });
    expect(onDeleted).toHaveBeenCalledWith(['a', 'b']);
    expect(result.current.isSelecting).toBe(false);
    expect(result.current.result).toEqual({ deletedIds: ['a', 'b'], failed: [] });
    expect(result.current.pending).toBe(false);
  });
});

describe('useBulkDelete — confirmDelete частичный успех', () => {
  it('onDeleted только по удалённым, остаются отмечены только отказавшие', async () => {
    const failed = [{ id: 'b', message: 'Только черновик можно удалить.' }];
    mockedApiFetch.mockResolvedValue({ deletedIds: ['a'], failed });
    const { result, onDeleted } = setup(['a', 'b']);

    act(() => result.current.start());
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('b'));

    await act(() => result.current.confirmDelete());

    expect(onDeleted).toHaveBeenCalledWith(['a']);
    // Режим выбора не закрылся — есть что показать человеку и починить.
    expect(result.current.isSelecting).toBe(true);
    expect(result.current.selectedVisibleIds).toEqual(['b']);
    expect(result.current.result).toEqual({ deletedIds: ['a'], failed });
  });
});

describe('useBulkDelete — confirmDelete сбой', () => {
  it('ApiError — текст сервера в error, выбор не трогаем, onDeleted не вызван', async () => {
    mockedApiFetch.mockRejectedValue(new ApiError('Сервис недоступен', 503, 'unknown'));
    const { result, onDeleted } = setup(['a']);

    act(() => result.current.start());
    act(() => result.current.toggle('a'));

    await act(() => result.current.confirmDelete());

    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));
    expect(onDeleted).not.toHaveBeenCalled();
    expect(result.current.selectedVisibleIds).toEqual(['a']);
    expect(result.current.pending).toBe(false);
  });

  it('сетевой сбой (не ApiError) — общий текст запасного сообщения', async () => {
    mockedApiFetch.mockRejectedValue(new TypeError('boom'));
    const { result } = setup(['a']);

    act(() => result.current.toggle('a'));
    await act(() => result.current.confirmDelete());

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Не удалось удалить. Проверьте связь и попробуйте ещё раз.',
      ),
    );
  });
});
