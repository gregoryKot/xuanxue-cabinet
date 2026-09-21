// Картинка одного варианта ответа в редакторе вопроса (ADR-0035) — кнопка
// «Добавить картинку»/сама картинка с «Убрать картинку», загрузка идёт через
// useExamImageUpload. Свой файл, не инлайн в ExamItemOptionsField.tsx: у
// файловой загрузки своя логика (pending, ошибка, сброс input) и свой набор
// тестов, отдельных от списка вариантов (CLAUDE.md «Файлы»/файл-храповик).
//
// Сам выбор файла — общий components/FilePickerButton.tsx: тот же контрол
// понадобился файлу материала (ADR-0057), и двух реализаций одного ввода в
// разных файлах быть не должно (CLAUDE.md «Одна механика — один компонент»).
import type { CSSProperties } from 'react';
import { EXAM_IMAGE_CONTENT_TYPES } from '@xuanxue/shared';
import { FilePickerButton } from '../components/FilePickerButton';
import { OptionImage } from '../components/OptionImage';
import { TextLinkButton } from '../components/TextLinkButton';
import { dangerNoteStyle } from '../components/screenLayout';
import { useExamImageUpload } from './useExamImageUpload';

const ACCEPT = EXAM_IMAGE_CONTENT_TYPES.join(',');

const withImageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  alignItems: 'flex-start',
};
interface ExamItemOptionImageProps {
  index: number;
  imageId?: string;
  onChange: (imageId: string | undefined) => void;
}

export function ExamItemOptionImage({
  index,
  imageId,
  onChange,
}: ExamItemOptionImageProps) {
  const { upload, pending, error } = useExamImageUpload();
  const label = `Картинка варианта ${index + 1}`;

  async function handleFile(file: File): Promise<void> {
    const uploadedId = await upload(file);
    if (uploadedId) onChange(uploadedId);
  }

  if (imageId) {
    return (
      <div style={withImageStyle}>
        <OptionImage imageId={imageId} size="thumb" alt={label} />
        <TextLinkButton onClick={() => onChange(undefined)}>
          Убрать картинку
        </TextLinkButton>
      </div>
    );
  }

  return (
    <div>
      <FilePickerButton
        label="Добавить картинку"
        inputLabel={label}
        accept={ACCEPT}
        pending={pending}
        onFile={(file) => void handleFile(file)}
      />
      {error && <p style={dangerNoteStyle}>{error}</p>}
    </div>
  );
}
