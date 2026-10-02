// «Как часто» у правила (ADR-0168) отдельно от формы занятия: строка правила
// приходит и из ответа сервера, и из черновика, записанного до ADR-0168, — у
// второй полей частоты и даты нет вовсе.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RuleRecurrenceFields } from './RuleRecurrenceFields';
import type { RuleDraft } from './ruleDraft';

const FRIDAY = 5;

function makeRule(overrides: Partial<RuleDraft> = {}): RuleDraft {
  return { weekday: FRIDAY, time: '20:00', durationMinText: '90', ...overrides };
}

describe('RuleRecurrenceFields', () => {
  it('строка из старого черновика без полей — «Каждую неделю», поля даты нет', () => {
    render(<RuleRecurrenceFields rule={makeRule()} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Как часто')).toHaveValue('1');
    expect(screen.queryByLabelText('Первое занятие')).not.toBeInTheDocument();
  });

  it('выбор «Раз в две недели» сообщает число 2, а не строку', async () => {
    const onChange = vi.fn();
    render(<RuleRecurrenceFields rule={makeRule()} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText('Как часто'), '2');

    expect(onChange).toHaveBeenCalledWith({ everyWeeks: 2 });
  });

  it('раз в две недели без даты — пустое поле и подсказка с днём правила', () => {
    render(
      <RuleRecurrenceFields rule={makeRule({ everyWeeks: 2 })} onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText('Первое занятие')).toHaveValue('');
    expect(screen.getByText('пятницу')).toBeInTheDocument();
    expect(
      screen.getByText(/От этой даты занятие идёт через неделю/),
    ).toBeInTheDocument();
  });

  it('выбранная дата уходит в onChange как строка «ГГГГ-ММ-ДД»', () => {
    const onChange = vi.fn();
    render(
      <RuleRecurrenceFields
        rule={makeRule({ everyWeeks: 2, startsOn: '' })}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Первое занятие'), {
      target: { value: '2026-10-02' },
    });

    expect(onChange).toHaveBeenCalledWith({ startsOn: '2026-10-02' });
  });

  it('подсказка называет день правила: другой день — другое слово', () => {
    render(
      <RuleRecurrenceFields
        rule={makeRule({ weekday: 2, everyWeeks: 2, startsOn: '2026-10-06' })}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('вторник')).toBeInTheDocument();
    expect(screen.getByLabelText('Первое занятие')).toHaveValue('2026-10-06');
  });
});
