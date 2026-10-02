// Нативный `<video>` файла из R2 (ADR-0133, ADR-0137) вместе с плашкой отказа
// (VideoFailureOverlay.tsx). Вынесен из ExamVideoPlayer.tsx, чтобы выбор
// источника (файл или ссылка) и починка оборванной загрузки не жили в одном
// файле.
//
// Обрыв связи и сворачивание приложения чинит useVideoRecovery.ts: он
// перезагружает элемент сам и возвращает секунду. Плашка нужна, когда три
// попытки подряд не помогли или браузер не открывает формат: без неё человеку
// осталась бы перезагрузка страницы.
import { useRef, type CSSProperties } from 'react';
import { VideoFailureOverlay } from './VideoFailureOverlay';
import { VIDEO_MAX_HEIGHT, type VideoFileSize } from './videoFileSize';
import { useVideoRecovery } from './useVideoRecovery';

const baseStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: '100%',
  height: 'auto',
  borderRadius: 'var(--radius-card)',
  background: '#000',
};

// Обёртка нужна плашке (`position: absolute` ждёт родителя с `relative`).
// Ширина 100% — как была у самого `<video>`: в колонке с `align-items:
// flex-start` (exam-items/useVideoAttach.tsx) блок без неё сжался бы до
// размера содержимого. У плитки ещё и высота: коробку задаёт класс в
// index.css, обёртка обязана её заполнить, иначе `height: 100%` у видео
// не от чего считать.
const wrapStyle: CSSProperties = { position: 'relative', width: '100%' };

interface VideoFilePlayerProps {
  src: string;
  /** Доступное имя видео — формулировка вопроса или подпись варианта. */
  title?: string;
  size: VideoFileSize;
}

export function VideoFilePlayer({ src, title, size }: VideoFilePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { failure, retry } = useVideoRecovery(videoRef, src);

  return (
    <div style={{ ...wrapStyle, height: size === 'tile' ? '100%' : undefined }}>
      {/* Субтитров нет: у видео вопроса это короткий клип движения без речи
          (ADR-0133, «Контекст» — «референс учителя»), у видео-ответа —
          снятая учеником форма, тоже без слов (ADR-0137), не запись занятия. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        controls
        preload="metadata"
        playsInline
        src={src}
        aria-label={title}
        style={{
          ...baseStyle,
          maxHeight: VIDEO_MAX_HEIGHT[size],
          objectFit: size === 'tile' ? 'contain' : undefined,
          height: size === 'tile' ? '100%' : 'auto',
        }}
      />
      {failure && (
        <VideoFailureOverlay failure={failure} src={src} size={size} onRetry={retry} />
      )}
    </div>
  );
}
