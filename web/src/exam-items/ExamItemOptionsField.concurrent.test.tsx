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

const startedUploads = new Map<string, (video: ExamVideoValue) => void>();

vi.mock('./ExamVideoField', () => ({
  ExamVideoField: ({
    inputLabel,
    onChange,
  }: {
    inputLabel: string;
    onChange: (video: ExamVideoValue) => void;
  }) => {
    // Запоминаем только первый колбэк — тот, что загрузка захватила при старте.
    if (!startedUploads.has(inputLabel)) startedUploads.set(inputLabel, onChange);
    return null;
  },
}));
vi.mock('./ExamItemOptionImage', () => ({ ExamItemOptionImage: () => null }));

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

    const finishFirst = startedUploads.get('Видео варианта 1');
    const finishSecond = startedUploads.get('Видео варианта 2');
    act(() => finishSecond?.({ videoId: 'v2' }));
    act(() => finishFirst?.({ videoId: 'v1' }));

    expect(current.map((option) => option.videoId)).toEqual(['v1', 'v2']);
  });
});
