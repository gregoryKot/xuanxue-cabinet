// Загрузка видео-ответа файлом (ADR-0137) — первый путь ответа на
// видео-вопрос там, где подключён R2 (video.fileUploadEnabled): выбор файла
// → полоса прогресса по частям → «Отменить»/«Продолжить сейчас» на паузе
// → готово (ExamMediaDto уже в попытке, applyMedia). Сеть и state machine —
// useAnswerVideoUpload.ts, здесь только вёрстка (CLAUDE.md «Логика вне
// компонентов»). Кнопка выбора — общий FilePickerButton.tsx (variant
// "primary" — правило акцента, docs/adr/0031: единственное главное действие
// экрана видео-вопроса).
import type { CSSProperties } from 'react';
import { ANSWER_VIDEO_LIMITS, ANSWER_VIDEO_RETENTION } from '@xuanxue/shared';
import { FilePickerButton } from '../components/FilePickerButton';
import { FormServerError } from '../components/FormServerError';
import { RichText } from '../components/RichText';
import { TextLinkButton } from '../components/TextLinkButton';
import { formatFileSize } from '../lib/formatFileSize';
import { answerVideoUploadProgress } from './answerVideoUpload';
import { attemptVideoHintStyle } from './attemptVideoStyles';
import { useAnswerVideoUpload } from './useAnswerVideoUpload';
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
const CANCEL_LABEL = 'Отменить';
const RESUME_LABEL = 'Продолжить сейчас';
const WAITING_TEXT = 'Связь пропала — продолжим сами, как только она вернётся.';
// Только после «Отменить»: незаконченная загрузка ждёт на сервере, и тот же
// файл продолжит её с места остановки (ADR-0137). На отказ сервера строки нет —
// формат или размер тем же файлом не исправить, что делать, говорит его текст.
const RESELECT_CONTINUES_TEXT =
  'Выберите тот же файл ещё раз — загрузка продолжится с места остановки.';

const progressTrackStyle: CSSProperties = {
  height: 8,
  borderRadius: 4,
  background: 'var(--panel)',
  overflow: 'hidden',
};
const progressTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};
const waitingRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};
const controlsStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };

function progressFillStyle(fraction: number): CSSProperties {
  return {
    height: '100%',
    width: `${Math.round(fraction * 100)}%`,
    background: 'var(--terracotta)',
  };
}

interface AttemptVideoUploadProps {
  itemId: string;
  video: AttemptVideoControls;
  /** Показ без права загрузить (предпросмотр «глазами ученика») — кнопка та же,
   * но файл выбрать нельзя. */
  disabled?: boolean;
}

export function AttemptVideoUpload({ itemId, video, disabled }: AttemptVideoUploadProps) {
  const { state, selectFile, cancel, resumeNow } = useAnswerVideoUpload({
    attemptId: video.attemptId,
    itemId,
    applyMedia: video.applyMedia,
  });

  const active = state.phase === 'uploading' || state.phase === 'waiting';
  // Подвал формы спрашивает, идёт ли загрузка, прежде чем отправить
  // (useAttemptSubmitFlow.ts, аудит 2026-10-01).
  useUploadActiveMark(video.attemptId, itemId, active);
  const uploadedBytes = Math.min(state.sentParts * state.partBytes, state.totalBytes);
  const fraction = answerVideoUploadProgress(state.sentParts, state.partCount);
  const percent = Math.round(fraction * 100);

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

      {active && (
        <div style={controlsStyle}>
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Загрузка видео"
            style={progressTrackStyle}
          >
            <div style={progressFillStyle(fraction)} />
          </div>
          <p style={progressTextStyle}>
            {formatFileSize(uploadedBytes)} из {formatFileSize(state.totalBytes)}
          </p>
          {state.phase === 'waiting' && (
            <div style={waitingRowStyle}>
              <p style={progressTextStyle}>{WAITING_TEXT}</p>
              <TextLinkButton onClick={resumeNow}>{RESUME_LABEL}</TextLinkButton>
            </div>
          )}
          <TextLinkButton onClick={cancel} danger>
            {CANCEL_LABEL}
          </TextLinkButton>
        </div>
      )}

      {state.phase === 'cancelled' && (
        <p style={progressTextStyle}>{RESELECT_CONTINUES_TEXT}</p>
      )}
      {state.phase === 'failed' && <FormServerError error={state.error} />}
    </>
  );
}
