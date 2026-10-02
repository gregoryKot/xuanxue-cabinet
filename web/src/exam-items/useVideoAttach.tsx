// Видео вопроса/варианта как пункт скрепки (components/AttachButton.tsx,
// отзыв владельца 2026-09-27) — вместо кнопки «Загрузить видео»/поля ссылки
// отдельной строкой. Загрузка и проверка ссылки не дублируются —
// useExamVideoField (ADR-0133); ход загрузки рисует тот же блок, что у
// видео-ответа ученика (video-upload/VideoUploadProgress.tsx, ADR-0165).
import {
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { EXAM_VIDEO_CONTENT_TYPES } from '@xuanxue/shared';
import type { AttachMenuItem } from '../components/AttachButton';
import { ExamVideoAttachPreview } from './ExamVideoAttachPreview';
import { useExamVideoField } from './useExamVideoField';
import type { ExamVideoValue } from './examVideoFormInput';

const VIDEO_ACCEPT = EXAM_VIDEO_CONTENT_TYPES.join(',');
const VIDEO_LABEL = 'Видео';

const hiddenInputStyle: CSSProperties = {
  position: 'absolute',
  opacity: 0,
  width: 1,
  height: 1,
  overflow: 'hidden',
};
export interface VideoAttachResult {
  /** Пункт меню «Видео» — файл (R2) или показ поля ссылки, решает
   * `fileStorageEnabled`. */
  menuItem: AttachMenuItem;
  /** Скрытый `<input type="file">`, только когда загрузка в R2 включена. */
  hiddenInput: ReactNode;
  /** Превью с «Убрать видео», ход загрузки, поле ссылки в режиме её ввода или
   * ошибка — рисует ExamVideoAttachPreview, а если показывать нечего, ничего. */
  preview: ReactNode;
  error: string | null;
}

export function useVideoAttach(
  inputLabel: string,
  value: ExamVideoValue,
  fileStorageEnabled: boolean,
  onChange: (next: ExamVideoValue) => void,
): VideoAttachResult {
  const field = useExamVideoField(onChange);
  const [linkMode, setLinkMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handlePick(): void {
    if (fileStorageEnabled) {
      inputRef.current?.click();
      return;
    }
    setLinkMode(true);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) field.uploadFile(file);
  }

  function handleClear(): void {
    setLinkMode(false);
    field.clear();
  }

  const menuItem: AttachMenuItem = {
    key: 'video',
    label: VIDEO_LABEL,
    onSelect: handlePick,
  };

  const hiddenInput = fileStorageEnabled ? (
    <input
      ref={inputRef}
      type="file"
      accept={VIDEO_ACCEPT}
      aria-label={inputLabel}
      style={hiddenInputStyle}
      onChange={handleFileChange}
    />
  ) : null;

  const preview = (
    <ExamVideoAttachPreview
      field={field}
      value={value}
      inputLabel={inputLabel}
      linkMode={linkMode}
      onClear={handleClear}
    />
  );

  return { menuItem, hiddenInput, preview, error: field.error };
}
