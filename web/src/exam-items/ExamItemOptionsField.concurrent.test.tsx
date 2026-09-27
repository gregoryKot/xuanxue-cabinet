// Регрессия: владелец поставил грузиться два видео вариантов одновременно —
// загрузился один, потом второй, и первый исчез (2026-09-27). Обработчик
// окончания загрузки держал список вариантов на момент нажатия и писал
// второй ролик поверх него. Здесь колбэки обоих полей берутся ДО первой
// правки — как у двух загрузок, начатых разом, — и вызываются по очереди.
import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ExamItemOptionsField } from './ExamItemOptionsField';
import type { ExamItemOptionDraft } from './examItemFormInput';
import type { ExamVideoValue } from './examVideoFormInput';

const startedUploads = new Map<number, (video: ExamVideoValue) => void>();

// Медиа варианта заглушкой: запоминаем только первый колбэк каждого варианта —
// тот, что загрузка захватила при старте.
vi.mock('./ExamItemOptionMedia', () => ({
  ExamItemOptionMedia: ({
    index,
    onVideoChange,
  }: {
    index: number;
    onVideoChange: (video: ExamVideoValue) => void;
  }) => {
    if (!startedUploads.has(index)) startedUploads.set(index, onVideoChange);
    return null;
  },
}));

function Harness({ onState }: { onState: (options: ExamItemOptionDraft[]) => void }) {
  const [options, setOptions] = useState<ExamItemOptionDraft[]>([
    { text: '', correct: true },
    { text: '', correct: false },
  ]);
  onState(options);
  return (
    <ExamItemOptionsField
      kind="single"
      options={options}
      fileStorageEnabled
      onChange={setOptions}
    />
  );
}

describe('ExamItemOptionsField — две загрузки видео разом', () => {
  it('оба ролика остаются, в каком бы порядке ни закончились', () => {
    startedUploads.clear();
    let current: ExamItemOptionDraft[] = [];
    render(<Harness onState={(options) => (current = options)} />);

    const finishFirst = startedUploads.get(0);
    const finishSecond = startedUploads.get(1);
    act(() => finishSecond?.({ videoId: 'v2' }));
    act(() => finishFirst?.({ videoId: 'v1' }));

    expect(current.map((option) => option.videoId)).toEqual(['v1', 'v2']);
  });
});
