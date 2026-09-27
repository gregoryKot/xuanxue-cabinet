// Видео вопроса/варианта как пункт скрепки (components/AttachButton.tsx,
// отзыв владельца 2026-09-27) — вместо кнопки «Загрузить видео»/поля ссылки
// отдельной строкой. Загрузка и проверка ссылки не дублируются —
// useExamVideoField (ADR-0133), тот же хук, что был за ExamVideoField.tsx
// (файл заменён этим хуком).
import {
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { EXAM_VIDEO_CONTENT_TYPES } from '@xuanxue/shared';
import type { AttachMenuItem } from '../components/AttachButton';
import { ExamVideoPlayer } from '../components/ExamVideoPlayer';
import { Field, inputStyle } from '../components/Field';
import { TextLinkButton } from '../components/TextLinkButton';
import { UploadProgress } from '../components/UploadProgress';
import { dangerNoteStyle } from '../components/screenLayout';
import { useExamVideoField } from './useExamVideoField';
import type { ExamVideoValue } from './examVideoFormInput';

const VIDEO_ACCEPT = EXAM_VIDEO_CONTENT_TYPES.join(',');
const VIDEO_LABEL = 'Видео';
const URL_LABEL = 'Ссылка на видео (YouTube)';
const REMOVE_LABEL = 'Убрать видео';

const hiddenInputStyle: CSSProperties = {
  position: 'absolute',
  opacity: 0,
  width: 1,
  height: 1,
  overflow: 'hidden',
};
// flexBasis: 100% в родительском flex-wrap ряду переносит превью/поле ссылки
// на свою строку под текстом и скрепкой (ExamItemOptionRow.tsx,
// ExamItemFormFields.tsx).
const previewWrapStyle: CSSProperties = {
  flexBasis: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  alignItems: 'flex-start',
  maxWidth: 360,
};

export interface VideoAttachResult {
  /** Пункт меню «Видео» — файл (R2) или показ поля ссылки, решает
   * `fileStorageEnabled`. */
  menuItem: AttachMenuItem;
  /** Скрытый `<input type="file">`, только когда загрузка в R2 включена. */
  hiddenInput: ReactNode;
  /** Превью с «Убрать видео», поле ссылки в режиме её ввода или ошибка —
   * `null`, если показывать нечего. */
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
  const hasVideo = Boolean(value.videoId || value.videoUrl);

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
    if (file) void field.uploadFile(file);
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

  let preview: ReactNode = null;
  if (field.uploadPending) {
    preview = <UploadProgress progress={field.uploadProgress} />;
  } else if (hasVideo) {
    preview = (
      <div style={previewWrapStyle}>
        <ExamVideoPlayer
          videoId={value.videoId}
          videoUrl={value.videoUrl}
          title={inputLabel}
          size="thumb"
        />
        <TextLinkButton onClick={handleClear}>{REMOVE_LABEL}</TextLinkButton>
      </div>
    );
  } else if (linkMode) {
    preview = (
      <div style={previewWrapStyle}>
        <Field label={URL_LABEL} error={field.error ?? undefined}>
          <input
            type="url"
            aria-label={inputLabel}
            style={inputStyle}
            placeholder="https://…"
            value={field.urlDraft}
            onChange={(event) => field.setUrlDraft(event.target.value)}
            onBlur={() => {
              if (field.urlDraft.trim()) field.commitUrl();
            }}
          />
        </Field>
      </div>
    );
  } else if (field.error) {
    preview = (
      <div style={previewWrapStyle}>
        <p style={dangerNoteStyle}>{field.error}</p>
      </div>
    );
  }

  return { menuItem, hiddenInput, preview, error: field.error };
}
