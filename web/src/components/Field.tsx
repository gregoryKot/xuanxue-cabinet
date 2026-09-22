// Единая обёртка поля формы (CLAUDE.md «Одна механика — один компонент»):
// <label> связывает подпись с полем неявно — без useId/htmlFor, надёжнее
// (не ломается при копипасте формы) и меньше кода. getInputStyle — общий
// стиль инпутов/селектов для всех форм кабинета, высота ≥44px (CLAUDE.md
// «Доступность»).
import type { CSSProperties, ReactNode } from 'react';

// Экспортирован: EmailField.tsx (CLAUDE.md «Одна механика — один компонент»)
// принимает тот же размер пропом и не имеет права держать свою копию union.
export type FieldControlSize = 'default' | 'large';

// Высота и паддинг — единственное, что меняется по размеру; рамка, радиус и
// фон общие. Экран входа (docs/adr/0043, макет 2d) — единственное место, где
// нужен «large»: поле почты там — не одно из многих в форме, а половина
// единственного альтернативного способа входа.
const controlSizes: Record<
  FieldControlSize,
  Pick<CSSProperties, 'minHeight' | 'padding'>
> = {
  default: { minHeight: 44, padding: '10px 12px' },
  large: { minHeight: 48, padding: '12px 14px' },
};

/** Стиль инпута/селекта нужного размера — проп вместо копии объекта style
 * (CLAUDE.md «Дубли»): рамка и радиус остаются одним источником для всех
 * форм кабинета, вне зависимости от размера контрола. */
export function getInputStyle(size: FieldControlSize = 'default'): CSSProperties {
  return {
    ...controlSizes[size],
    borderRadius: 'var(--radius-control)',
    // Приглушённая рамка контролов (не --line — та для разделителей/рамок
    // карточек, тут нужнее чуть заметнее): поле стоит на белом, страница —
    // на тёплой бумаге почти того же тона, боковую рамку не заменить фоном.
    border: '1px solid var(--control-border)',
    // Шрифт контрола сюда не возвращать: инлайн-стиль в каскаде сильнее
    // правила таблицы стилей (тот же приём, что у button/listCardStyles —
    // index.css, «Отклик на нажатие»), и раз объявленный здесь `font`
    // навсегда перебивал бы `input, textarea, select` в index.css. Кегль
    // контрола живёт одним правилом там — 16px, иначе Safari на iPhone
    // зумит страницу при фокусе и не возвращает масштаб назад (отзыв
    // владельца 2026-09-22, docs/adr/0109). Семейство шрифта — тем же
    // правилом: по умолчанию браузер рисует контрол системным шрифтом, а не
    // наследует его, поэтому гротеск кабинета контролу даёт `font-family:
    // inherit` в index.css, не этот объект.
    background: 'var(--card)',
    color: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  };
}

export const inputStyle: CSSProperties = getInputStyle();

// Поле под число («Лимит времени», «Попыток у ученика», «Вопросов ученику»):
// во всю ширину колонки оно читается как поле для текста и пугает пустотой
// (снимок владельца 2026-09-21, редактор экзамена). Ширина под 4–5 цифр —
// одна на все числовые поля кабинета, чтобы они не расходились по экранам.
export const numericInputStyle: CSSProperties = { ...inputStyle, width: 112 };

const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const labelTextStyle: CSSProperties = { fontSize: 14, fontWeight: 600 };
const hintStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };
const errorStyle: CSSProperties = { fontSize: 13, color: 'var(--danger)' };

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  // hint/error — вне <label>: текст подсказки внутри label иначе склеивается
  // в доступное имя поля («Подпись группыНапример…»), и getByLabelText
  // (точный текст) в тестах и скринридерах перестаёт находить поле по одной
  // подписи.
  return (
    <div style={fieldStyle}>
      <label style={fieldStyle}>
        <span style={labelTextStyle}>{label}</span>
        {children}
      </label>
      {error ? (
        <span style={errorStyle} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span style={hintStyle}>{hint}</span>
      ) : null}
    </div>
  );
}
