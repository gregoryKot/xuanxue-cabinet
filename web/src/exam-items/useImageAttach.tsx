// Картинка варианта ответа как пункт скрепки (components/AttachButton.tsx,
// отзыв владельца 2026-09-27) — вместо кнопки «Добавить картинку» под полем.
// Сама загрузка не дублируется: useExamImageUpload (ADR-0035) та же, что была
// у ExamItemOptionImage.tsx (файл заменён этим хуком).
import { useRef, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import { EXAM_IMAGE_CONTENT_TYPES } from '@xuanxue/shared';
import type { AttachMenuItem } from '../components/AttachButton';
import { OptionImage } from '../components/OptionImage';
import { TextLinkButton } from '../components/TextLinkButton';
import { dangerNoteStyle, noteStyle } from '../components/screenLayout';
import { useExamImageUpload } from './useExamImageUpload';

const ACCEPT = EXAM_IMAGE_CONTENT_TYPES.join(',');
const IMAGE_LABEL = 'Картинка';
const REMOVE_LABEL = 'Убрать картинку';
const PENDING_TEXT = 'Загружаем…';

const hiddenInputStyle: CSSProperties = {
  position: 'absolute',
  opacity: 0,
  width: 1,
  height: 1,
  overflow: 'hidden',
};
// flexBasis: 100% в flex-wrap ряду строки варианта (ExamItemOptionRow.tsx)
// переносит превью на свою строку под полем ввода и скрепкой.
const previewWrapStyle: CSSProperties = {
  flexBasis: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  alignItems: 'flex-start',
};

export interface ImageAttachResult {
  /** Пункт меню «Картинка» — открывает системный выбор файла. */
  menuItem: AttachMenuItem;
  /** Скрытый `<input type="file">`, рисуется всегда: меню запускает его
   * кликом по ref, не программным выбором файла. */
  hiddenInput: ReactNode;
  /** Миниатюра с «Убрать картинку», когда картинка уже стоит; ошибка
   * загрузки, когда сбой; иначе `null`. */
  preview: ReactNode;
  error: string | null;
}

export function useImageAttach(
  index: number,
  imageId: string | undefined,
  onChange: (imageId: string | undefined) => void,
): ImageAttachResult {
  const { upload, pending, error } = useExamImageUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const label = `Картинка варианта ${index + 1}`;

  async function handleFile(file: File): Promise<void> {
    const uploadedId = await upload(file);
    if (uploadedId) onChange(uploadedId);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void handleFile(file);
  }

  const menuItem: AttachMenuItem = {
    key: 'image',
    label: IMAGE_LABEL,
    onSelect: () => inputRef.current?.click(),
  };

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      aria-label={label}
      style={hiddenInputStyle}
      onChange={handleChange}
    />
  );

  let preview: ReactNode = null;
  if (imageId) {
    preview = (
      <div style={previewWrapStyle}>
        <OptionImage imageId={imageId} size="thumb" alt={label} />
        <TextLinkButton onClick={() => onChange(undefined)}>
          {REMOVE_LABEL}
        </TextLinkButton>
      </div>
    );
  } else if (pending) {
    preview = (
      <div style={previewWrapStyle}>
        <span aria-busy="true" style={noteStyle}>
          {PENDING_TEXT}
        </span>
      </div>
    );
  } else if (error) {
    preview = (
      <div style={previewWrapStyle}>
        <p style={dangerNoteStyle}>{error}</p>
      </div>
    );
  }

  return { menuItem, hiddenInput, preview, error };
}
