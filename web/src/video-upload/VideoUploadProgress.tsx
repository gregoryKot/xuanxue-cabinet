// Что человек видит, пока видео сжимается, грузится и после (ADR-0137,
// ADR-0165): полоса прогресса (при сжатии — «Сжимаем видео — 40%» и «Отправить
// без сжатия» с пояснением, при загрузке по частям — «N из M»), просьба не
// закрывать страницу, «Отменить», на паузе — «Продолжить сейчас»;
// после «Отменить» — подсказка выбрать тот же файл; после отказа — текст
// сервера. Выбор файла и объяснение «откуда это и зачем» остаются за экраном
// вида видео: они у каждого свои. Только вёрстка по состоянию хука
// (useVideoUpload.ts, CLAUDE.md «Логика вне компонентов»).
import type { CSSProperties } from 'react';
import { FormServerError } from '../components/FormServerError';
import { RichText } from '../components/RichText';
import { TextLinkButton } from '../components/TextLinkButton';
import { formatFileSize } from '../lib/formatFileSize';
import { isVideoUploadActive, type VideoUploadState } from './videoUploadState';
import { videoUploadProgress } from './videoUploadParts';

const UPLOAD_BAR_LABEL = 'Загрузка видео';
const COMPRESS_BAR_LABEL = 'Сжатие видео';
// Отзыв владельца с телефона 2026-09-27: «нужно ли оставаться на странице?».
// Одна строка для всех видов видео; браузер тем же переспросит при закрытии
// вкладки (useWarnBeforeUnload в useVideoUpload.ts).
const STAY_ON_PAGE_HINT =
  'Не закрывайте страницу, пока видео **грузится**: загрузка остановится.';
const CANCEL_LABEL = 'Отменить';
const RESUME_LABEL = 'Продолжить сейчас';
// Отзыв владельца 2026-10-02: «пусть пользователь выбирает: у меня плохая сеть —
// сжать видео, или просто загружать». Сжатие идёт само, а выбор — только здесь,
// пока оно идёт: ученику не нужно решать заранее (ADR-0165).
const SKIP_COMPRESSION_LABEL = 'Отправить без сжатия';
const SKIP_COMPRESSION_HINT =
  'Сжатое видео в **несколько раз меньше** — на слабой связи оно уйдёт быстрее. ' +
  'Если связь хорошая или нужно исходное качество, отправьте без сжатия.';
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

interface VideoUploadProgressProps {
  state: VideoUploadState;
  onCancel: () => void;
  onResume: () => void;
  onSkipCompression: () => void;
}

export function VideoUploadProgress({
  state,
  onCancel,
  onResume,
  onSkipCompression,
}: VideoUploadProgressProps) {
  const isCompressing = state.phase === 'compressing';
  const uploadedBytes = Math.min(state.sentParts * state.partBytes, state.totalBytes);
  const fraction = isCompressing
    ? state.compressProgress
    : videoUploadProgress(state.sentParts, state.partCount);
  const percent = Math.round(fraction * 100);

  return (
    <>
      {isVideoUploadActive(state) && (
        <div style={controlsStyle}>
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={isCompressing ? COMPRESS_BAR_LABEL : UPLOAD_BAR_LABEL}
            style={progressTrackStyle}
          >
            <div style={progressFillStyle(fraction)} />
          </div>
          <p style={progressTextStyle}>
            {isCompressing ? (
              <RichText text={`Сжимаем видео — **${percent}%**`} />
            ) : (
              `${formatFileSize(uploadedBytes)} из ${formatFileSize(state.totalBytes)}`
            )}
          </p>
          {isCompressing && state.canSkipCompression && (
            <>
              <p style={progressTextStyle}>
                <RichText text={SKIP_COMPRESSION_HINT} />
              </p>
              <TextLinkButton onClick={onSkipCompression}>
                {SKIP_COMPRESSION_LABEL}
              </TextLinkButton>
            </>
          )}
          {state.phase === 'waiting' && (
            <div style={waitingRowStyle}>
              <p style={progressTextStyle}>{WAITING_TEXT}</p>
              <TextLinkButton onClick={onResume}>{RESUME_LABEL}</TextLinkButton>
            </div>
          )}
          <p style={progressTextStyle}>
            <RichText text={STAY_ON_PAGE_HINT} />
          </p>
          <TextLinkButton onClick={onCancel} danger>
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
