// Файл материала на его странице (ADR-0057, слой 3.10) — своя логика
// (сеть, ошибка, скрытый input) и свой набор тестов, отдельно от общих
// полей материала (MaterialFormFields.tsx, CLAUDE.md «Файлы»/файл-храповик).
// Сам выбор файла — общий components/FilePickerButton.tsx: тот же контрол
// стоит у картинки варианта ответа (ADR-0035), и двух реализаций одного
// ввода в разных файлах быть не должно (CLAUDE.md «Одна механика — один
// компонент»).
import type { CSSProperties } from 'react';
import {
  MATERIAL_FILE_CONTENT_TYPES,
  MATERIAL_FILE_LIMITS,
  type MaterialFileDto,
} from '@xuanxue/shared';
import { FilePickerButton } from '../components/FilePickerButton';
import { TextLinkButton } from '../components/TextLinkButton';
import { dangerNoteStyle, noteStyle } from '../components/screenLayout';
import { formatFileSize } from '../lib/formatFileSize';
import { MaterialFileDownloadLink } from './MaterialFileDownloadLink';
import { useMaterialFileUpload } from './useMaterialFileUpload';

const ACCEPT = MATERIAL_FILE_CONTENT_TYPES.join(',');
const FIELD_LABEL = 'Файл материала';
const ADD_LABEL = 'Добавить файл';
const REPLACE_LABEL = 'Заменить файл';
const REMOVE_LABEL = 'Убрать файл';
const MAX_MB = MATERIAL_FILE_LIMITS.maxBytes / (1024 * 1024);
// Подсказка стоит там, где файла ещё нет: формат и потолок нужно знать ДО
// выбора файла на телефоне — если он не подойдёт, человек узнает это раньше,
// чем закончит загрузку.
const FORMATS_HINT = `PDF или картинка — JPG, PNG, WebP, до ${MAX_MB} МБ.`;

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const labelTextStyle: CSSProperties = { fontSize: 14, fontWeight: 600 };
const actionsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 16,
};
const fileNameStyle: CSSProperties = { margin: 0, wordBreak: 'break-word' };

interface MaterialFileFieldProps {
  materialId: string;
  file?: MaterialFileDto;
  /** Материал сохранён заново (файл загружен/заменён/убран) — страница
   * перечитывает его, чтобы показать актуальное состояние (наименее вычурный
   * способ синхронизации, по образцу reload() в useEntityEditor.ts). */
  onChanged: () => void;
}

export function MaterialFileField({
  materialId,
  file,
  onChanged,
}: MaterialFileFieldProps) {
  const { upload, remove, pending, error } = useMaterialFileUpload(materialId);

  async function handleFile(selected: File): Promise<void> {
    const updated = await upload(selected);
    if (updated) onChanged();
  }

  async function handleRemove(): Promise<void> {
    const updated = await remove();
    if (updated) onChanged();
  }

  const picker = (
    <FilePickerButton
      label={file ? REPLACE_LABEL : ADD_LABEL}
      accept={ACCEPT}
      pending={pending}
      onFile={(selected) => void handleFile(selected)}
    />
  );

  return (
    <div style={sectionStyle}>
      <span style={labelTextStyle}>{FIELD_LABEL}</span>
      {file ? (
        <div style={sectionStyle}>
          <p style={fileNameStyle}>{file.name}</p>
          <p style={noteStyle}>{formatFileSize(file.sizeBytes)}</p>
          <div style={actionsRowStyle}>
            <MaterialFileDownloadLink materialId={materialId} />
            {picker}
            <TextLinkButton danger disabled={pending} onClick={() => void handleRemove()}>
              {REMOVE_LABEL}
            </TextLinkButton>
          </div>
        </div>
      ) : (
        <div style={sectionStyle}>
          {picker}
          <p style={noteStyle}>{FORMATS_HINT}</p>
        </div>
      )}
      {error && <p style={dangerNoteStyle}>{error}</p>}
    </div>
  );
}
