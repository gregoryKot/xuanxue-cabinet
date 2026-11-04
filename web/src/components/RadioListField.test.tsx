import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RadioListField } from './RadioListField';

const OPTIONS = [
  { id: '', label: 'Без группы' },
  { id: 'g1', label: 'Начинающие', hint: 'Новички' },
  { id: 'g2', label: 'Средние' },
];

function Harness({ onChange }: { onChange?: (id: string) => void }) {
  const [selected, setSelected] = useState('g1');
  return (
    <RadioListField
      legend="Группа"
      options={OPTIONS}
      selectedId={selected}
      onChange={(id) => {
        setSelected(id);
        onChange?.(id);
      }}
    />
  );
}

describe('RadioListField', () => {
  it('рисует группу радио под подписью, отмечена одна — выбранная', () => {
    render(<Harness />);

    expect(screen.getByRole('group', { name: 'Группа' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Начинающие' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Средние' })).not.toBeChecked();
    expect(screen.getByText('Новички')).toBeInTheDocument();
  });

  it('выбор другой строки зовёт onChange с её id и снимает прежнюю', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Средние' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('g2');
    expect(screen.getByRole('radio', { name: 'Средние' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Начинающие' })).not.toBeChecked();
  });

  it('пустой id — обычная строка «Без группы», её можно выбрать', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Без группы' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('повторный клик по выбранной строке onChange не зовёт', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Начинающие' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('два списка на странице — две независимые группы радио', () => {
    render(
      <>
        <RadioListField
          legend="Первая"
          options={OPTIONS}
          selectedId="g1"
          onChange={vi.fn()}
        />
        <RadioListField
          legend="Вторая"
          options={OPTIONS}
          selectedId="g2"
          onChange={vi.fn()}
        />
      </>,
    );

    const first = screen.getByRole('group', { name: 'Первая' });
    const second = screen.getByRole('group', { name: 'Вторая' });
    expect(first.querySelector('input:checked')).toHaveAccessibleName('Начинающие');
    expect(second.querySelector('input:checked')).toHaveAccessibleName('Средние');
  });

  it('вариантов нет — текст пустого состояния; есть ошибка — под списком', () => {
    render(
      <RadioListField
        legend="Группа"
        options={[]}
        selectedId=""
        onChange={vi.fn()}
        emptyMessage="Групп пока нет."
        error="Выберите группу."
      />,
    );

    expect(screen.getByText('Групп пока нет.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Выберите группу.');
  });
});
