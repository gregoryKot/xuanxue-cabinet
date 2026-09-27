// Файл материала на его странице (ADR-0057, слой 3.10) — своя логика
// (сеть, ошибка, скрытый input) и свой набор тестов, отдельно от общих
// полей материала (MaterialFormFields.tsx, CLAUDE.md «Файлы»/файл-храповик).
// Сам выбор файла — общий components/FilePickerButton.tsx: тот же контрол
// стоит у картинки варианта ответа (ADR-0035), и двух реализаций одного
// ввода в разных файлах быть не должно (CLAUDE.md «Одна механика — один
// компонент»). Подписи, стили и каркас — общие с полем ещё не созданного
// материала (NewMaterialFileField.tsx, ADR-0134) в materialFileFieldParts.tsx.
import type { MaterialDto, MaterialFileDto } from '@xuanxue/shared';
import { FilePickerButton } from '../components/FilePickerButton';
import { TextLinkButton } from '../components/TextLinkButton';
import { materialFilePath } from '../api/apiPaths';
import { noteStyle, textLinkStyle } from '../components/screenLayout';
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
import { useMaterialFileUpload } from './useMaterialFileUpload';

const DOWNLOAD_LABEL = 'Скачать';

interface MaterialFileFieldProps {
  materialId: string;
  file?: MaterialFileDto;
  /** Материал сохранён заново (файл загружен/заменён/убран) — родитель
   * получает свежий MaterialDto из ответа записи (CLAUDE.md «API»: свежее
   * состояние из ответа, не отдельным GET), а не просто сигнал «перечитай».
   * Нужно и странице материала по маршруту, и восстановленной после сбоя
   * загрузки странице нового материала (MaterialEditorForm.tsx, ADR-0134) —
   * у неё маршрута с id нет, перечитать по нему нечем. */
  onChanged: (updated: MaterialDto) => void;
}

export function MaterialFileField({
  materialId,
  file,
  onChanged,
}: MaterialFileFieldProps) {
  const { upload, remove, pending, error } = useMaterialFileUpload(materialId);

  async function handleFile(selected: File): Promise<void> {
    const updated = await upload(selected);
    if (updated) onChanged(updated);
  }

  async function handleRemove(): Promise<void> {
    const updated = await remove();
    if (updated) onChanged(updated);
  }

  const picker = (
    <FilePickerButton
      label={file ? MATERIAL_FILE_REPLACE_LABEL : MATERIAL_FILE_ADD_LABEL}
      accept={MATERIAL_FILE_ACCEPT}
      pending={pending}
      onFile={(selected) => void handleFile(selected)}
    />
  );

  return (
    <MaterialFileFieldShell
      hasFile={file !== undefined}
      picker={picker}
      error={error}
      fileInfo={
        file && (
          <>
            <p style={materialFileNameStyle}>{file.name}</p>
            <p style={noteStyle}>{formatFileSize(file.sizeBytes)}</p>
            <div style={materialFileActionsRowStyle}>
              {/* Обычная ссылка, не apiFetch: сервер отвечает 302 на подписанный
                  адрес в другом домене, а `connectSrc: 'self'` в CSP
                  (api/src/security/csp.ts) оборвал бы такой редирект у fetch —
                  навигация по <a href> под CSP не ограничена. Не «чинить» на
                  apiFetch. */}
              <a href={`/api${materialFilePath(materialId)}`} style={textLinkStyle}>
                {DOWNLOAD_LABEL}
              </a>
              {picker}
              <TextLinkButton
                danger
                disabled={pending}
                onClick={() => void handleRemove()}
              >
                {MATERIAL_FILE_REMOVE_LABEL}
              </TextLinkButton>
            </div>
          </>
        )
      }
    />
  );
}
