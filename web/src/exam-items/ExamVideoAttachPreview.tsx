// Что стоит под скрепкой «Видео» (useVideoAttach.tsx, ADR-0133): ход загрузки
// файла, готовое видео с «Убрать видео», поле ссылки в режиме её ввода или
// ошибка — и ничего, если показывать нечего. Одна ветка на состояние, по
// приоритету: идёт загрузка → есть видео → ввод ссылки → отказ или ошибка.
// Ход загрузки, «отменено» и отказ сервера рисует общий блок
// (video-upload/VideoUploadProgress.tsx, как у видео-ответа ученика, ADR-0165);
// в покое и после «готово» он не рисует ничего.
import type { CSSProperties } from 'react';
import { ExamVideoPlayer } from '../components/ExamVideoPlayer';
import { Field, inputStyle } from '../components/Field';
import { TextLinkButton } from '../components/TextLinkButton';
import { dangerNoteStyle } from '../components/screenLayout';
import { VideoUploadProgress } from '../video-upload/VideoUploadProgress';
import { isVideoUploadActive } from '../video-upload/videoUploadState';
import type { ExamVideoValue } from './examVideoFormInput';
import type { UseExamVideoFieldResult } from './useExamVideoField';

const URL_LABEL = 'Ссылка на видео (YouTube)';
const REMOVE_LABEL = 'Убрать видео';

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

interface ExamVideoAttachPreviewProps {
  field: UseExamVideoFieldResult;
  value: ExamVideoValue;
  inputLabel: string;
  /** Показано поле ссылки (R2 не подключён и учитель выбрал «Видео»). */
  linkMode: boolean;
  onClear: () => void;
}

export function ExamVideoAttachPreview({
  field,
  value,
  inputLabel,
  linkMode,
  onClear,
}: ExamVideoAttachPreviewProps) {
  const upload = (
    <VideoUploadProgress
      state={field.upload}
      onCancel={field.cancelUpload}
      onResume={field.resumeUpload}
      onSkipCompression={field.skipCompression}
    />
  );
  const hasUploadNote =
    field.upload.phase === 'cancelled' || field.upload.phase === 'failed';

  if (isVideoUploadActive(field.upload)) {
    return <div style={previewWrapStyle}>{upload}</div>;
  }
  if (value.videoId || value.videoUrl) {
    return (
      <div style={previewWrapStyle}>
        {upload}
        <ExamVideoPlayer
          videoId={value.videoId}
          videoUrl={value.videoUrl}
          title={inputLabel}
          size="thumb"
        />
        <TextLinkButton onClick={onClear}>{REMOVE_LABEL}</TextLinkButton>
      </div>
    );
  }
  if (linkMode) {
    return (
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
  }
  if (hasUploadNote || field.error) {
    return (
      <div style={previewWrapStyle}>
        {upload}
        {field.error && <p style={dangerNoteStyle}>{field.error}</p>}
      </div>
    );
  }
  return null;
}
