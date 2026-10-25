// Выбор файла записи занятия (ADR-0180): кнопка выбора, ход загрузки общим
// блоком (video-upload/VideoUploadProgress.tsx — части, «Отменить», «Не закрывайте
// страницу»), готовый файл с «Убрать файл». Загрузку ведёт useRecordingForm.ts,
// здесь только вёрстка по его состоянию (CLAUDE.md «Логика вне компонентов»).
import type { CSSProperties } from 'react';
import { EXAM_VIDEO_CONTENT_TYPES } from '@xuanxue/shared';
import { FilePickerButton } from '../components/FilePickerButton';
import { TextLinkButton } from '../components/TextLinkButton';
import { VideoUploadProgress } from '../video-upload/VideoUploadProgress';
import type { UseRecordingFormResult } from './useRecordingForm';

const CHOOSE_LABEL = 'Выбрать файл записи';
const REMOVE_LABEL = 'Убрать файл';
const VIDEO_ACCEPT = EXAM_VIDEO_CONTENT_TYPES.join(',');

const wrapStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const readyStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };

export function RecordingFileField({ form }: { form: UseRecordingFormResult }) {
  const { upload } = form;
  const showPicker = !form.isUploading && !form.isFileReady;

  return (
    <div style={wrapStyle}>
      {showPicker && (
        <FilePickerButton
          label={CHOOSE_LABEL}
          accept={VIDEO_ACCEPT}
          pending={false}
          onFile={form.pickFile}
        />
      )}
      <VideoUploadProgress
        state={upload.state}
        onCancel={upload.cancel}
        onResume={upload.resumeNow}
        onSkipCompression={upload.skipCompression}
      />
      {form.isFileReady && (
        <>
          <p style={readyStyle}>
            {/* Имя файла вводит не мы — в RichText его не кладём: звёздочка в имени
                стала бы маркером. */}
            Файл <strong style={{ fontWeight: 600 }}>{form.fileName}</strong> загружен.
          </p>
          <TextLinkButton onClick={form.removeFile}>{REMOVE_LABEL}</TextLinkButton>
        </>
      )}
    </div>
  );
}
