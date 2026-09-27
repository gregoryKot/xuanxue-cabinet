// Подсказка про видео вопроса зависит от типа ответа — второй ролик у
// single/multiple живёт у вариантов (ExamItemOptionsField.tsx), общая с
// text/video формулировка увела бы туда, где второго видео нет вовсе (отзыв
// владельца с телефона: «как прикрепить второй ролик?»). Само поле видео —
// заглушка: его логика и тексты покрыты в ExamVideoField.test.tsx, здесь
// важно только то, какой `hint` он получает.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExamItemFormFields } from './ExamItemFormFields';
import type { ExamItemFormState } from './examItemFormInput';

vi.mock('./ExamVideoField', () => ({
  ExamVideoField: ({ hint }: { hint: string }) => <p>{hint}</p>,
}));

function baseState(overrides: Partial<ExamItemFormState> = {}): ExamItemFormState {
  return { kind: 'text', prompt: '', options: [], ...overrides };
}

function renderFields(kind: ExamItemFormState['kind']) {
  render(
    <ExamItemFormFields
      state={baseState({ kind })}
      setField={vi.fn()}
      error={null}
      fileStorageEnabled
    />,
  );
}

describe('ExamItemFormFields — подсказка видео вопроса по типу ответа', () => {
  it('text — «покажите движение»', () => {
    renderFields('text');
    expect(screen.getByText(/Покажите движение/)).toBeInTheDocument();
  });

  it('video — та же подсказка, что у text', () => {
    renderFields('video');
    expect(screen.getByText(/Покажите движение/)).toBeInTheDocument();
  });

  it('single — про видео у вариантов, не общая', () => {
    renderFields('single');
    expect(
      screen.getByText(/Ролики для выбора добавьте к вариантам/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Покажите движение/)).not.toBeInTheDocument();
  });

  it('multiple — та же подсказка, что у single', () => {
    renderFields('multiple');
    expect(
      screen.getByText(/Ролики для выбора добавьте к вариантам/),
    ).toBeInTheDocument();
  });
});
