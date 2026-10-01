import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { hasActiveUploads, resetActiveUploads } from './activeUploads';
import { useUploadActiveMark } from './useUploadActiveMark';

afterEach(() => resetActiveUploads());

describe('useUploadActiveMark', () => {
  it('active: true — отмечено, active: false — снято', () => {
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => useUploadActiveMark('a1', 'q1', active),
      { initialProps: { active: true } },
    );
    expect(hasActiveUploads()).toBe(true);

    rerender({ active: false });
    expect(hasActiveUploads()).toBe(false);
  });

  it('размонтирование посреди загрузки снимает отметку', () => {
    const { unmount } = renderHook(() => useUploadActiveMark('a1', 'q1', true));
    expect(hasActiveUploads()).toBe(true);

    unmount();
    expect(hasActiveUploads()).toBe(false);
  });

  it('два вопроса грузятся — отметка держится, пока жив хоть один', () => {
    const first = renderHook(() => useUploadActiveMark('a1', 'q1', true));
    const second = renderHook(() => useUploadActiveMark('a1', 'q2', true));

    first.unmount();
    expect(hasActiveUploads()).toBe(true);
    second.unmount();
    expect(hasActiveUploads()).toBe(false);
  });
});
