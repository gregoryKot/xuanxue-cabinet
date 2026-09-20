// Поле «Почта» — общая механика для формы входа (auth/EmailLoginForm.tsx) и
// формы привязки второго ключа входа в кабинете (auth/EmailLinkForm.tsx,
// ADR-0059): один рисунок поля ввода, а не две реализации одного ввода в
// разных файлах (CLAUDE.md «Одна механика — один компонент», гейт jscpd).
// Разметка перенесена из EmailLoginForm.tsx дословно — внешний вид экрана
// входа не поменялся ни на пиксель.
import { Field, getInputStyle, type FieldControlSize } from './Field';

interface EmailFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** 'large' — экран входа (docs/adr/0043, макет 2d): поле почты там не одно
   * из многих в форме, а половина единственного альтернативного способа
   * входа. По умолчанию — обычный размер формы кабинета. */
  size?: FieldControlSize;
}

export function EmailField({ value, onChange, size = 'default' }: EmailFieldProps) {
  return (
    <Field label="Почта">
      <input
        style={getInputStyle(size)}
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="имя@почта.ру"
      />
    </Field>
  );
}
