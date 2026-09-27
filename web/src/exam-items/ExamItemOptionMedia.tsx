// Медиа одного варианта ответа — картинка или видео, взаимоисключающе
// (ADR-0035/ADR-0133): пока ни одного не выбрано, «Добавить картинку» и поле
// видео стоят рядом как два равных способа; выбранный способ — своя
// подпись + «Убрать», второй пропадает, пока это медиа не снимут. Свой файл,
// не инлайн в ExamItemOptionRow.tsx: строка и так держит текст, отметку
// «верный» и кнопку удаления, добавлять сюда ещё две ветки вывело бы файл за
// файловый храповик (CLAUDE.md «Храповики»).
import type { CSSProperties } from 'react';
import { ExamItemOptionImage } from './ExamItemOptionImage';
import { ExamVideoField } from './ExamVideoField';
import type { ExamVideoValue } from './examVideoFormInput';

// VOICE: до первого действия (CLAUDE.md) — зачем видео варианту, пример из
// отзыва владельца 2026-09-23 (ADR-0133): «выбрать правильный из двух».
const VIDEO_HINT = 'Два ролика — ученик выберет, где сделано верно';

const pickRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  alignItems: 'flex-start',
};

interface ExamItemOptionMediaProps {
  index: number;
  imageId?: string;
  videoId?: string;
  videoUrl?: string;
  fileStorageEnabled: boolean;
  onImageChange: (imageId: string | undefined) => void;
  onVideoChange: (video: ExamVideoValue) => void;
}

export function ExamItemOptionMedia({
  index,
  imageId,
  videoId,
  videoUrl,
  fileStorageEnabled,
  onImageChange,
  onVideoChange,
}: ExamItemOptionMediaProps) {
  if (imageId) {
    return (
      <ExamItemOptionImage index={index} imageId={imageId} onChange={onImageChange} />
    );
  }
  if (videoId || videoUrl) {
    return (
      <ExamVideoField
        inputLabel={`Видео варианта ${index + 1}`}
        hint={VIDEO_HINT}
        value={{ videoId, videoUrl }}
        fileStorageEnabled={fileStorageEnabled}
        onChange={onVideoChange}
      />
    );
  }
  return (
    <div style={pickRowStyle}>
      <ExamItemOptionImage index={index} onChange={onImageChange} />
      <ExamVideoField
        inputLabel={`Видео варианта ${index + 1}`}
        hint={VIDEO_HINT}
        value={{}}
        fileStorageEnabled={fileStorageEnabled}
        onChange={onVideoChange}
      />
    </div>
  );
}
