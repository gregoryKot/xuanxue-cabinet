// Общие подписи, `accept`, стили и каркас двух полей файла материала —
// сохранённого (MaterialFileField.tsx) и ещё не созданного
// (NewMaterialFileField.tsx, ADR-0133) — чтобы порядок действий и вид не
// разъезжались по двум копиям (CLAUDE.md «Одна механика — один компонент»,
// jscpd: без общего каркаса блоки «файла нет»/ошибки совпадали дословно).
import type { CSSProperties, ReactNode } from 'react';
import { MATERIAL_FILE_CONTENT_TYPES, MATERIAL_FILE_LIMITS } from '@xuanxue/shared';
import { dangerNoteStyle, noteStyle } from '../components/screenLayout';

export const MATERIAL_FILE_FIELD_LABEL = 'Файл материала';
export const MATERIAL_FILE_ADD_LABEL = 'Добавить файл';
export const MATERIAL_FILE_REPLACE_LABEL = 'Заменить файл';
export const MATERIAL_FILE_REMOVE_LABEL = 'Убрать файл';

export const MATERIAL_FILE_ACCEPT = MATERIAL_FILE_CONTENT_TYPES.join(',');

const MAX_MB = MATERIAL_FILE_LIMITS.maxBytes / (1024 * 1024);
// Подсказка стоит там, где файла ещё нет: формат и потолок нужно знать ДО
// выбора файла на телефоне — если он не подойдёт, человек узнает это раньше,
// чем закончит загрузку.
export const MATERIAL_FILE_FORMATS_HINT = `PDF, документ Word (.docx) или картинка — JPG, PNG, WebP, до ${MAX_MB} МБ.`;

export const materialFileSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
export const materialFileLabelTextStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
};
export const materialFileActionsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 16,
};
export const materialFileNameStyle: CSSProperties = {
  margin: 0,
  wordBreak: 'break-word',
};

interface MaterialFileFieldShellProps {
  /** Есть файл (сохранённый или выбранный) — решает, что показать вместо
   * кнопки выбора: `fileInfo` или общую подсказку про форматы. */
  hasFile: boolean;
  /** `FilePickerButton` — рисуется здесь, когда файла нет; когда он есть,
   * его при необходимости вставляет сам `fileInfo` («Заменить файл»). */
  picker: ReactNode;
  /** Имя, размер и действия — своя разметка у каждого поля (сохранённый
   * файл даёт «Скачать» и грузит сразу, ещё не созданный — только помечает,
   * что уйдёт при сохранении), общий только каркас вокруг. */
  fileInfo?: ReactNode;
  error: string | null;
}

/** Каркас, общий для MaterialFileField.tsx и NewMaterialFileField.tsx —
 * подпись поля, ветка «файл есть»/«файла нет» и строка ошибки. */
export function MaterialFileFieldShell({
  hasFile,
  picker,
  fileInfo,
  error,
}: MaterialFileFieldShellProps) {
  return (
    <div style={materialFileSectionStyle}>
      <span style={materialFileLabelTextStyle}>{MATERIAL_FILE_FIELD_LABEL}</span>
      {hasFile ? (
        <div style={materialFileSectionStyle}>{fileInfo}</div>
      ) : (
        <div style={materialFileSectionStyle}>
          {picker}
          <p style={noteStyle}>{MATERIAL_FILE_FORMATS_HINT}</p>
        </div>
      )}
      {error && <p style={dangerNoteStyle}>{error}</p>}
    </div>
  );
}
