import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field, getInputStyle, inputStyle } from './Field';

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

  // Проводка через RichText (ADR-0124) — образец теста из RichText.test.tsx.
  it('звёздочки в подсказке становятся <strong>', () => {
    render(
      <Field label="Название" hint="До **19:00** сегодня">
        <input />
      </Field>,
    );

    const strong = screen.getByText('19:00');
    expect(strong.tagName).toBe('STRONG');
  });

  // Направление «тихо и благородно» поменяло рамку и радиус поля — цель
  // нажатия ≥44px (CLAUDE.md «Доступность») должна остаться на месте.
  it('inputStyle держит высоту цели нажатия ≥44px', () => {
    expect(inputStyle.minHeight).toBe(44);
  });

  // Экран входа (docs/adr/0043, макет 2d) — единственное место с полем
  // крупнее обычных 44px; проп размера, не второй экспортируемый объект.
  it('getInputStyle("large") даёт 48px для экрана входа, не трогая рамку и радиус', () => {
    const large = getInputStyle('large');
    expect(large.minHeight).toBe(48);
    expect(large.padding).toBe('12px 14px');
    expect(large.border).toBe(inputStyle.border);
    expect(large.borderRadius).toBe(inputStyle.borderRadius);
  });

  // Регрессия на отзыв владельца 2026-09-22 («при нажатии на поле почты всё
  // приложение зумится ближе», docs/adr/0109): кегль контрола обязан жить в
  // index.css, а не в инлайн-объекте стиля — инлайн-стиль в каскаде сильнее
  // правила таблицы стилей и вернул бы зум на iPhone, даже если правило
  // index.css останется на месте.
  it('getInputStyle() не задаёт шрифт инлайном — размер живёт в index.css', () => {
    expect(inputStyle.font).toBeUndefined();
    expect(inputStyle.fontSize).toBeUndefined();
  });

  it('getInputStyle("large") тоже не задаёт шрифт инлайном', () => {
    const large = getInputStyle('large');
    expect(large.font).toBeUndefined();
    expect(large.fontSize).toBeUndefined();
  });
});
