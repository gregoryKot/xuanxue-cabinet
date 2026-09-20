// Выбор файла кнопкой — один контрол на весь кабинет (CLAUDE.md «Одна
// механика — один компонент»). Двое потребителей: картинка варианта ответа
// (exam-items/ExamItemOptionImage.tsx, ADR-0035) и файл материала
// (materials/MaterialFileField.tsx, ADR-0057).
//
// Скрытый `<input type="file">` внутри `<label>`: видимая кнопка — сам
// label. `display: none` нельзя — он убрал бы input из таб-порядка
// (CLAUDE.md «Доступность»); рамка фокуса — класс `.xuanxue-file-label` в
// index.css (`:focus-within`, инлайн-стиль так не умеет).
import type { ChangeEvent, CSSProperties } from 'react';
import { noteStyle, textLinkButtonStyle } from './screenLayout';

const PENDING_TEXT = 'Загружаем…';

const hiddenInputStyle: CSSProperties = {
  position: 'absolute',
  opacity: 0,
  width: 1,
  height: 1,
  overflow: 'hidden',
};
// <label> — строчный элемент, minHeight из textLinkButtonStyle на нём не
// работает; inline-flex делает цель нажатия честными 44 px. position:
// relative — скрытый input позиционируется относительно самой кнопки, иначе
// фокус на нём мог бы прокрутить страницу к чужому месту.
const labelStyle: CSSProperties = {
  ...textLinkButtonStyle,
  display: 'inline-flex',
  alignItems: 'center',
  position: 'relative',
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
}

export function FilePickerButton({
  label,
  accept,
  pending,
  onFile,
  inputLabel,
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

  return (
    <label className="xuanxue-file-label" style={labelStyle}>
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
