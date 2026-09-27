// Видео вопроса/варианта в редакторе (ADR-0133) — один компонент на обе
// формы: «Загрузить видео» файлом, когда R2 подключён (`fileStorageEnabled`,
// `GET /auth/config`, тот же приём, что materials/MaterialEditorForm.tsx),
// иначе ссылка (YouTube и подобное). Уже поставленное видео — превью общим
// плеером (components/ExamVideoPlayer.tsx) и «Убрать видео», без права
// править на месте: смена способа — сначала снять, потом добавить заново,
// тем же приёмом, что картинка варианта (ExamItemOptionImage.tsx).
//
// Существующий вопрос/вариант с `videoUrl` остаётся видимым как ссылка, даже
// если R2 включили позже, и наоборот (ADR-0133): режим решает не
// `fileStorageEnabled`, а то, что уже стоит в `value` — превью показывается
// всегда раньше проверки режима загрузки.
import type { CSSProperties } from 'react';
import { EXAM_VIDEO_CONTENT_TYPES } from '@xuanxue/shared';
import { ExamVideoPlayer } from '../components/ExamVideoPlayer';
import { Field, inputStyle } from '../components/Field';
import { FilePickerButton } from '../components/FilePickerButton';
import { RichText } from '../components/RichText';
import { TextLinkButton } from '../components/TextLinkButton';
import { dangerNoteStyle, noteStyle } from '../components/screenLayout';
import { useWarnBeforeUnload } from '../hooks/useWarnBeforeUnload';
import { useExamVideoField } from './useExamVideoField';
import type { ExamVideoValue } from './examVideoFormInput';

const VIDEO_ACCEPT = EXAM_VIDEO_CONTENT_TYPES.join(',');
const URL_LABEL = 'Ссылка на видео (YouTube)';
const REMOVE_LABEL = 'Убрать видео';
const UPLOAD_LABEL = 'Загрузить видео';
// Отзыв владельца с телефона: уйти со страницы во время загрузки роняет её
// без предупреждения браузера — useWarnBeforeUnload включает стандартный
// диалог «покинуть сайт?», эта строка объясняет, что произойдёт молча иначе.
const STAY_ON_PAGE_HINT =
  'Не закрывайте страницу, пока видео **грузится**, — иначе загрузка ' +
  'оборвётся и придётся начать заново.';

const withVideoStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  alignItems: 'flex-start',
  maxWidth: 360,
};
const emptyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  alignItems: 'flex-start',
  maxWidth: 360,
};

interface ExamVideoFieldProps {
  /** Доступное имя контрола — различает несколько полей видео на одном
   * экране («Видео вопроса», «Видео варианта 2»), тот же приём, что
   * `inputLabel` у FilePickerButton/OptionImage. */
  inputLabel: string;
  /** Объяснение до первого действия (CLAUDE.md «откуда это и зачем») — видно
   * только в пустом состоянии, до выбора файла или ввода ссылки. */
  hint: string;
  value: ExamVideoValue;
  fileStorageEnabled: boolean;
  onChange: (next: ExamVideoValue) => void;
}

export function ExamVideoField({
  inputLabel,
  hint,
  value,
  fileStorageEnabled,
  onChange,
}: ExamVideoFieldProps) {
  const field = useExamVideoField(onChange);
  useWarnBeforeUnload(field.uploadPending);

  if (value.videoId || value.videoUrl) {
    return (
      <div style={withVideoStyle}>
        <ExamVideoPlayer
          videoId={value.videoId}
          videoUrl={value.videoUrl}
          title={inputLabel}
        />
        <TextLinkButton onClick={field.clear}>{REMOVE_LABEL}</TextLinkButton>
      </div>
    );
  }

  return (
    <div style={emptyStyle}>
      <p style={noteStyle}>
        <RichText text={hint} />
      </p>
      {fileStorageEnabled ? (
        <>
          <FilePickerButton
            label={UPLOAD_LABEL}
            inputLabel={inputLabel}
            accept={VIDEO_ACCEPT}
            pending={field.uploadPending}
            progress={field.uploadProgress}
            onFile={(file) => void field.uploadFile(file)}
          />
          {field.uploadPending && (
            <p style={noteStyle}>
              <RichText text={STAY_ON_PAGE_HINT} />
            </p>
          )}
          {field.error && <p style={dangerNoteStyle}>{field.error}</p>}
        </>
      ) : (
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
      )}
    </div>
  );
}
