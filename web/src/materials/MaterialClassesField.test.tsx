// По образцу schedule/ClassChannelsField.test.tsx — та же механика
// (components/CheckboxListField.tsx), другая подпись и текст пустого списка.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ClassDto } from '@xuanxue/shared';
import { makeClass } from '../test-support/planningFixtures';
import { MaterialClassesField } from './MaterialClassesField';

function renderField(classes: ClassDto[], selectedIds: string[] = []) {
  const onChange = vi.fn();
  render(
    <MemoryRouter>
      <MaterialClassesField
        classes={classes}
        selectedIds={selectedIds}
        onChange={onChange}
      />
    </MemoryRouter>,
  );
  return { onChange };
}

describe('MaterialClassesField', () => {
  it('нет ни одного занятия — подсказка со ссылкой на «Расписание», чекбоксов нет', () => {
    renderField([]);

    expect(screen.getByText(/Занятий пока нет/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '«Расписании»' })).toHaveAttribute(
      'href',
      '/schedule',
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('список занятий — чекбокс отмечен только для выбранных', () => {
    renderField(
      [
        makeClass({ id: 'c1', title: 'Тайцзицюань, средняя группа' }),
        makeClass({ id: 'c2', title: 'Цигун, начинающие' }),
      ],
      ['c1'],
    );

    expect(screen.getByLabelText('Тайцзицюань, средняя группа')).toBeChecked();
    expect(screen.getByLabelText('Цигун, начинающие')).not.toBeChecked();
  });

  it('пустой выбор — подсказка, что материал увидят ученики любого занятия', () => {
    renderField([makeClass()]);

    expect(
      screen.getByText(/материал увидят ученики любого занятия школы/),
    ).toBeInTheDocument();
  });

  it('отметка занятия добавляет его id в выбранные', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField([makeClass({ id: 'c1' })], []);

    await user.click(screen.getByLabelText('Тайцзицюань, средняя группа'));

    expect(onChange).toHaveBeenCalledWith(['c1']);
  });

  it('снятие отметки убирает id из выбранных', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField([makeClass({ id: 'c1' })], ['c1']);

    await user.click(screen.getByLabelText('Тайцзицюань, средняя группа'));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
