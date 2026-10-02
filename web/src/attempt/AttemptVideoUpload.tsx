// Загрузка видео-ответа файлом (ADR-0137) — первый путь ответа на
// видео-вопрос там, где подключён R2 (video.fileUploadEnabled): выбор файла
// → полоса прогресса по частям → «Отменить»/«Продолжить сейчас» на паузе
// → готово (ExamMediaDto уже в попытке, applyMedia). Загрузка частями — общая
// для всех видео-файлов (video-upload/, ADR-0165); здесь свой только
// транспорт ответа (answerVideoTransport.ts), объяснение и срок хранения.
// Кнопка выбора — общий FilePickerButton.tsx (variant "primary" — правило
// акцента, docs/adr/0031: единственное главное действие экрана
// видео-вопроса).
import { useCallback } from 'react';
import {
  ANSWER_VIDEO_LIMITS,
  ANSWER_VIDEO_RETENTION,
  ANSWER_VIDEO_TOO_LARGE_MESSAGE,
} from '@xuanxue/shared';
import { FilePickerButton } from '../components/FilePickerButton';
import { RichText } from '../components/RichText';
import { useVideoUpload } from '../video-upload/useVideoUpload';
import { VideoUploadProgress } from '../video-upload/VideoUploadProgress';
import { isVideoUploadActive } from '../video-upload/videoUploadState';
import { answerVideoTransport } from './answerVideoTransport';
import { attemptVideoHintStyle } from './attemptVideoStyles';
import { useUploadActiveMark } from './useUploadActiveMark';
import type { AttemptVideoControls } from './useAttemptMedia';

const BYTES_IN_GB = 1024 * 1024 * 1024;
const MAX_GB = ANSWER_VIDEO_LIMITS.maxBytes / BYTES_IN_GB;

// Числа — из общих констант (ADR-0137, shared/answer-videos.ts), не литералы:
// потолок и срок хранения меняются там же, откуда их берёт сервер.
const EXPLANATION =
  `Снимите форму на телефон и **загрузите видео сюда** — до ${MAX_GB} ГБ. ` +
  `Храним **${ANSWER_VIDEO_RETENTION.afterGradedDays} дней после проверки**.`;
const CHOOSE_LABEL = 'Загрузить видео';

interface AttemptVideoUploadProps {
  itemId: string;
  video: AttemptVideoControls;
  /** Показ без права загрузить (предпросмотр «глазами ученика») — кнопка та же,
   * но файл выбрать нельзя. */
  disabled?: boolean;
}

export function AttemptVideoUpload({ itemId, video, disabled }: AttemptVideoUploadProps) {
  const { attemptId, applyMedia } = video;
  const createTransport = useCallback(
    () => answerVideoTransport(attemptId, itemId),
    [attemptId, itemId],
  );
  const { state, selectFile, cancel, resumeNow } = useVideoUpload({
    createTransport,
    onDone: applyMedia,
    maxBytes: ANSWER_VIDEO_LIMITS.maxBytes,
    tooLargeMessage: ANSWER_VIDEO_TOO_LARGE_MESSAGE,
  });

  const active = isVideoUploadActive(state);
  // Подвал формы спрашивает, идёт ли загрузка, прежде чем отправить
  // (useAttemptSubmitFlow.ts, аудит 2026-10-01).
  useUploadActiveMark(attemptId, itemId, active);

  return (
    <>
      <p style={attemptVideoHintStyle}>
        <RichText text={EXPLANATION} />
      </p>

      {!active && (
        <FilePickerButton
          label={CHOOSE_LABEL}
          accept="video/*"
          pending={false}
          onFile={selectFile}
          variant="primary"
          disabled={disabled}
        />
      )}

      <VideoUploadProgress state={state} onCancel={cancel} onResume={resumeNow} />
    </>
  );
}
