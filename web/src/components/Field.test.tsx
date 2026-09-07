import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from './Field';

describe('Field', () => {
  it('связывает подпись с полем через label — поле находится по тексту подписи', () => {
    render(
      <Field label="Название">
        <input defaultValue="Тайцзицюань" />
      </Field>,
    );

    expect(screen.getByLabelText('Название')).toHaveValue('Тайцзицюань');
  });

  it('при ошибке показывает её вместо подсказки', () => {
    render(
      <Field label="Название" hint="Подсказка" error="Впишите название занятия.">
        <input />
      </Field>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Впишите название занятия.');
    expect(screen.queryByText('Подсказка')).not.toBeInTheDocument();
  });

  it('без ошибки показывает подсказку', () => {
    render(
      <Field label="Название" hint="Подсказка">
        <input />
      </Field>,
    );

    expect(screen.getByText('Подсказка')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
