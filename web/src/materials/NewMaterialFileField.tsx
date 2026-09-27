// Файл ещё не созданного материала (ADR-0134, слой 3.10) — выбор без сети:
// в момент выбора файл только проверяют (useNewMaterialFile.ts), а на
// сервер он уходит вместе с созданием материала («Сохранить»,
// useMaterialForm.ts). Подписи, стили и каркас — общие с MaterialFileField.tsx
// (файл уже сохранённого материала) в materialFileFieldParts.tsx, чтобы поля
// не разъехались (CLAUDE.md «Одна механика — один компонент», jscpd).
import { FilePickerButton } from '../components/FilePickerButton';
import { TextLinkButton } from '../components/TextLinkButton';
import { noteStyle } from '../components/screenLayout';
import { formatFileSize } from '../lib/formatFileSize';
import {
  MATERIAL_FILE_ACCEPT,
  MATERIAL_FILE_ADD_LABEL,
  MATERIAL_FILE_REMOVE_LABEL,
  MATERIAL_FILE_REPLACE_LABEL,
  MaterialFileFieldShell,
  materialFileActionsRowStyle,
  materialFileNameStyle,
} from './materialFileFieldParts';

// VOICE.md: короче 80 знаков, честно про порядок действий — файл уходит на
// сервер вместе с материалом, не раньше и не отдельным запросом.
const PENDING_UPLOAD_NOTE =
  'Загрузится вместе с материалом, когда вы нажмёте «Сохранить».';

interface NewMaterialFileFieldProps {
  file: File | null;
  error: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
}

export function NewMaterialFileField({
  file,
  error,
  onSelect,
  onRemove,
}: NewMaterialFileFieldProps) {
  const picker = (
    <FilePickerButton
      label={file ? MATERIAL_FILE_REPLACE_LABEL : MATERIAL_FILE_ADD_LABEL}
      accept={MATERIAL_FILE_ACCEPT}
      pending={false}
      onFile={onSelect}
    />
  );

  return (
    <MaterialFileFieldShell
      hasFile={file !== null}
      picker={picker}
      error={error}
      fileInfo={
        file && (
          <>
            <p style={materialFileNameStyle}>{file.name}</p>
            <p style={noteStyle}>{formatFileSize(file.size)}</p>
            <p style={noteStyle}>{PENDING_UPLOAD_NOTE}</p>
            <div style={materialFileActionsRowStyle}>
              {picker}
              <TextLinkButton danger onClick={onRemove}>
                {MATERIAL_FILE_REMOVE_LABEL}
              </TextLinkButton>
            </div>
          </>
        )
      }
    />
  );
}
