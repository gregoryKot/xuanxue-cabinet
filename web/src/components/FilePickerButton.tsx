// Выбор файла видимой кнопкой — один контрол на весь кабинет (CLAUDE.md
// «Одна механика — один компонент»), потребитель — файл материала
// (materials/MaterialFileField.tsx, ADR-0057). Картинка и видео варианта
// ответа с 2026-09-27 выбираются иначе — скрепкой без подписи
// (exam-items/useImageAttach.tsx, useVideoAttach.tsx,
// components/AttachButton.tsx): свой скрытый `<input type="file">`, не
// через этот компонент, потому что видимой кнопки-подписи там уже нет.
//
// Скрытый `<input type="file">` внутри `<label>`: видимая кнопка — сам
// label. `display: none` нельзя — он убрал бы input из таб-порядка
// (CLAUDE.md «Доступность»); рамка фокуса — класс `.xuanxue-file-label` в
// index.css (`:focus-within`, инлайн-стиль так не умеет).
import type { ChangeEvent, CSSProperties } from 'react';
import { noteStyle, textLinkHitAreaStyle, textLinkLineStyle } from './screenLayout';

const PENDING_TEXT = 'Загружаем…';

const hiddenInputStyle: CSSProperties = {
  position: 'absolute',
  opacity: 0,
  width: 1,
  height: 1,
  overflow: 'hidden',
};
// <label> остаётся строчным элементом, но цель нажатия ему даёт
// textLinkHitAreaStyle (screenLayout.ts) — без линии: border-bottom на
// коробке 44px рисовался бы по её дну, в стороне от подписи (разбор приёма —
// там же). Линия — на внутреннем <span> вокруг подписи, ниже по разметке.
// position: relative — скрытый input позиционируется относительно самой
// кнопки, иначе фокус на нём мог бы прокрутить страницу к чужому месту.
const labelStyle: CSSProperties = {
  ...textLinkHitAreaStyle,
  position: 'relative',
};
// Загрузка видео-ответа (ADR-0137) — первое и единственное главное действие
// экрана видео-вопроса: силуэт как у Button variant="primary"
// (components/Button.tsx), но кнопки нет DOM-элементом `<button>` внутри
// `<label>` не бывает (вложенный интерактивный элемент запрещён HTML) —
// повторяем те же стили на самом `<label>`, не заводя вторую реализацию
// выбора файла (CLAUDE.md «Одна механика — один компонент»).
const primaryLabelStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  minWidth: 44,
  padding: '10px 18px',
  borderRadius: 'var(--radius-control)',
  border: '1px solid transparent',
  fontWeight: 500,
  cursor: 'pointer',
  background: 'var(--terracotta)',
  color: 'var(--terracotta-contrast)',
  alignSelf: 'flex-start',
};
// Замена кнопки на время загрузки — не кнопка со спиннером (CLAUDE.md
// «Загрузка»: спиннер только на кнопке действия, а здесь на секунду нет и
// самой кнопки, только текст со статусом).
const pendingStyle: CSSProperties = {
  ...noteStyle,
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
};

interface FilePickerButtonProps {
  /** Подпись видимой кнопки. */
  label: string;
  /** Значение `accept` — типы через запятую. */
  accept: string;
  /** Идёт загрузка: вместо кнопки — строка со статусом. */
  pending: boolean;
  /** Выбранный файл. Значение input сбрасывается до вызова: тот же файл
   * можно выбрать повторно после сбоя — браузер не шлёт `change` на
   * повторный выбор того же значения, если input его не забыл. */
  onFile: (file: File) => void;
  /** Имя поля для скринридера, если оно отличается от подписи кнопки: у
   * картинки варианта подпись общая («Добавить картинку»), а полей на экране
   * несколько — различает их только это имя. */
  inputLabel?: string;
  /** `'primary'` — заливка терракотой (правило акцента, docs/adr/0031): для
   * экрана, где выбор файла — единственное главное действие (видео-ответ,
   * ADR-0137). По умолчанию `'text'` — прежний вид, действие второго плана. */
  variant?: 'text' | 'primary';
}

export function FilePickerButton({
  label,
  accept,
  pending,
  onFile,
  inputLabel,
  variant = 'text',
}: FilePickerButtonProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onFile(file);
  }

  if (pending) {
    return (
      <span aria-busy="true" style={pendingStyle}>
        {PENDING_TEXT}
      </span>
    );
  }

  if (variant === 'primary') {
    return (
      <label className="xuanxue-file-label" style={primaryLabelStyle}>
        {label}
        <input
          type="file"
          accept={accept}
          aria-label={inputLabel ?? label}
          style={hiddenInputStyle}
          onChange={handleChange}
        />
      </label>
    );
  }

  return (
    <label className="xuanxue-file-label" style={labelStyle}>
      <span style={textLinkLineStyle}>{label}</span>
      <input
        type="file"
        accept={accept}
        aria-label={inputLabel ?? label}
        style={hiddenInputStyle}
        onChange={handleChange}
      />
    </label>
  );
}
