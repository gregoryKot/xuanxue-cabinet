// Переключатель «просить объяснение» (ADR-0146) — общий компонент для
// страницы вопроса и инлайн-формы редактора экзамена.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExamItemReasonField } from './ExamItemReasonField';
import type { ExamItemFormState } from './examItemFormInput';

function makeState(overrides: Partial<ExamItemFormState> = {}): ExamItemFormState {
  return {
    kind: 'single',
    prompt: 'Формулировка',
    options: [],
    askReason: false,
    ...overrides,
  };
}

describe('ExamItemReasonField', () => {
  it('вопрос с вариантами — переключатель виден, выключен по умолчанию', () => {
    render(<ExamItemReasonField state={makeState()} setField={() => {}} />);

    expect(
      screen.getByRole('checkbox', { name: 'Попросить объяснить ответ' }),
    ).not.toBeChecked();
  });

  it('askReason включён — переключатель отмечен', () => {
    render(
      <ExamItemReasonField state={makeState({ askReason: true })} setField={() => {}} />,
    );

    expect(
      screen.getByRole('checkbox', { name: 'Попросить объяснить ответ' }),
    ).toBeChecked();
  });

  it('клик зовёт setField с askReason и новым значением', async () => {
    const user = userEvent.setup();
    const setField = vi.fn();
    render(<ExamItemReasonField state={makeState()} setField={setField} />);

    await user.click(screen.getByRole('checkbox', { name: 'Попросить объяснить ответ' }));

    expect(setField).toHaveBeenCalledWith('askReason', true);
  });

  it('вопрос без вариантов (text) — переключателя нет вовсе', () => {
    render(
      <ExamItemReasonField state={makeState({ kind: 'text' })} setField={() => {}} />,
    );

    expect(
      screen.queryByRole('checkbox', { name: 'Попросить объяснить ответ' }),
    ).not.toBeInTheDocument();
  });

  it('вопрос без вариантов (video) — переключателя нет вовсе', () => {
    render(
      <ExamItemReasonField state={makeState({ kind: 'video' })} setField={() => {}} />,
    );

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('поясняющая строка объясняет последствие включения', () => {
    render(<ExamItemReasonField state={makeState()} setField={() => {}} />);

    expect(
      screen.getByText(
        'Ученик объяснит выбор текстом. Без объяснения работу не отправить.',
      ),
    ).toBeInTheDocument();
  });
});
