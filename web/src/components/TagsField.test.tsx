// Поле тегов само по себе: подпись, подсказка, ошибка, даталист и ряд
// нажимаемых пилюль, которых нет, когда подсказывать нечего. Через все пять
// форм то же самое пришлось бы проверять дважды — контрол общий (CLAUDE.md
// «Одна механика — один компонент»), и отвечает он за себя здесь, один раз.
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

  it('без options — ряда пилюль нет вовсе', () => {
    render(<TagsField value="" onChange={vi.fn()} hint="Через запятую" />);

    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('с options — пилюля на каждый тег, ещё не выбранная не нажата', () => {
    render(
      <TagsField
        value=""
        onChange={vi.fn()}
        hint="Через запятую"
        options={['старшая', 'база']}
      />,
    );

    const pill = screen.getByRole('button', { name: 'старшая' });
    expect(pill).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'база' })).toBeInTheDocument();
  });

  it('уже выбранный тег в значении — пилюля нажата', () => {
    render(
      <TagsField
        value="старшая"
        onChange={vi.fn()}
        hint="Через запятую"
        options={['старшая', 'база']}
      />,
    );

    expect(screen.getByRole('button', { name: 'старшая' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'база' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('клик по пилюле добавляет тег в значение', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TagsField
        value="старшая"
        onChange={onChange}
        hint="Через запятую"
        options={['старшая', 'база']}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'база' }));

    expect(onChange).toHaveBeenCalledWith('старшая, база');
  });

  it('повторный клик по уже выбранной пилюле снимает тег', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TagsField
        value="старшая, база"
        onChange={onChange}
        hint="Через запятую"
        options={['старшая', 'база']}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'база' }));

    expect(onChange).toHaveBeenCalledWith('старшая');
  });
});
