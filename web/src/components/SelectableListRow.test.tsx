import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SelectableListRow } from './SelectableListRow';

describe('SelectableListRow — без selection', () => {
  it('строка — кнопка на весь ряд, клик открывает запись', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <ul>
        <SelectableListRow onOpen={onOpen}>Первый вопрос</SelectableListRow>
      </ul>,
    );

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Первый вопрос' }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('isLast=true — без нижней волосяной линии', () => {
    const { container } = render(
      <ul>
        <SelectableListRow onOpen={vi.fn()} isLast>
          Последняя строка
        </SelectableListRow>
      </ul>,
    );

    // jsdom не раскладывает `border-bottom` с var() в цвете на длинные
    // свойства, а геттер шорт-формы для `borderBottom: 'none'` отдаёт «medium»
    // (баг cssstyle, тот же обход в ExamItemCard.test.tsx) — сравниваем
    // длинную форму, её jsdom выставляет верно.
    const li = container.querySelector('li');
    expect(li?.style.borderBottomStyle).toBe('none');
  });
});

describe('SelectableListRow — с selection', () => {
  it('чекбокс с доступным именем по тексту строки, checked отражает isSelected', () => {
    render(
      <ul>
        <SelectableListRow
          onOpen={vi.fn()}
          selection={{ isSelected: true, onToggle: vi.fn() }}
        >
          Первый вопрос
        </SelectableListRow>
      </ul>,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Первый вопрос' });
    expect(checkbox).toBeChecked();
  });

  it('клик по строке зовёт onToggle, а не onOpen', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    render(
      <ul>
        <SelectableListRow onOpen={onOpen} selection={{ isSelected: false, onToggle }}>
          Первый вопрос
        </SelectableListRow>
      </ul>,
    );

    await user.click(screen.getByText('Первый вопрос'));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('отмеченная строка выделена фоном', () => {
    const { container } = render(
      <ul>
        <SelectableListRow
          onOpen={vi.fn()}
          selection={{ isSelected: true, onToggle: vi.fn() }}
        >
          Строка
        </SelectableListRow>
      </ul>,
    );

    expect(container.querySelector('li')).toHaveStyle({ background: 'var(--panel)' });
  });
});
