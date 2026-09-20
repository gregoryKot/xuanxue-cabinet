// Поле тегов само по себе: подпись, подсказка, ошибка и даталист, которого
// нет, когда подсказывать нечего. Через формы материала и вопроса экзамена то
// же самое пришлось бы проверять дважды — контрол общий (CLAUDE.md «Одна
// механика — один компонент»), и отвечает он за себя здесь, один раз.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TagsField } from './TagsField';

describe('TagsField', () => {
  it('находится по подписи «Теги», показывает значение и подсказку', () => {
    render(<TagsField value="ян, база" onChange={vi.fn()} hint="Через запятую" />);

    expect(screen.getByLabelText('Теги')).toHaveValue('ян, база');
    expect(screen.getByText('Через запятую')).toBeInTheDocument();
  });

  it('ввод вызывает onChange с новым текстом', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TagsField value="ян" onChange={onChange} hint="Через запятую" />);

    await user.type(screen.getByLabelText('Теги'), ',');

    expect(onChange).toHaveBeenLastCalledWith('ян,');
  });

  it('с непустым options — у инпута есть list, и в даталисте столько же option, сколько тегов', () => {
    render(
      <TagsField
        value=""
        onChange={vi.fn()}
        hint="Через запятую"
        options={['ян', 'база', 'разминка']}
      />,
    );

    const input = screen.getByLabelText('Теги');
    const datalistId = input.getAttribute('list');
    expect(datalistId).toBeTruthy();

    const datalist = document.getElementById(datalistId ?? '');
    expect(datalist?.querySelectorAll('option')).toHaveLength(3);
  });

  it('без options — даталиста нет и атрибута list у инпута нет', () => {
    render(<TagsField value="" onChange={vi.fn()} hint="Через запятую" />);

    expect(screen.getByLabelText('Теги')).not.toHaveAttribute('list');
    expect(document.querySelector('datalist')).not.toBeInTheDocument();
  });

  it('error показывается вместо подсказки', () => {
    render(
      <TagsField
        value=""
        onChange={vi.fn()}
        hint="Через запятую"
        error="Слишком длинный тег."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Слишком длинный тег.');
    expect(screen.queryByText('Через запятую')).not.toBeInTheDocument();
  });
});
