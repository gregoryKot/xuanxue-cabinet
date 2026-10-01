// Нативный `<video>` файла из R2 (ADR-0133, ADR-0137) вместе с плашкой
// «Загрузить снова». Вынесен из ExamVideoPlayer.tsx, чтобы выбор источника
// (файл или ссылка) и починка оборванной загрузки не жили в одном файле.
//
// Обрыв связи и сворачивание приложения чинит useVideoRecovery.ts: он
// перезагружает элемент сам и возвращает секунду. Плашка нужна на случай,
// когда три попытки подряд не помогли — без неё человеку осталась бы
// перезагрузка страницы.
import { useRef, type CSSProperties } from 'react';
import { Button } from './Button';
import { RichText } from './RichText';
import { useVideoRecovery } from './useVideoRecovery';

export type VideoFileSize = 'thumb' | 'tile' | 'full';

const VIDEO_DROPPED_TEXT =
  'Видео не догрузилось — связь оборвалась. Продолжится **с того же места**';
const RETRY_LABEL = 'Загрузить снова';

// 'thumb' — миниатюра в списке (тот же кегль, что OptionImage 'thumb');
// 'tile' — вписывается в высоту плитки варианта (attempt/AttemptOptionTile.tsx,
// класс `.xuanxue-option-tile-media` в index.css задаёт высоту коробки);
// 'full' (по умолчанию) — во всю ширину колонки, естественная высота под
// вопросом или в поле редактора.
const MAX_HEIGHT: Record<VideoFileSize, string> = {
  thumb: '96px',
  tile: '100%',
  full: 'none',
};

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

// Плашка непрозрачная: под ней у оборванного видео всё равно чёрное поле.
// Кегль и поля поджаты под плитку: на телефоне она 132–160px шириной и 160px
// высотой, плашка с текстом и кнопкой в 44px иначе упирается в обрезку.
const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '8px 12px',
  textAlign: 'center',
  borderRadius: 'var(--radius-card)',
  background: 'var(--panel)',
  color: 'var(--ink)',
  fontSize: 13,
  lineHeight: 1.3,
};

interface VideoFilePlayerProps {
  src: string;
  /** Доступное имя видео — формулировка вопроса или подпись варианта. */
  title?: string;
  size: VideoFileSize;
}

export function VideoFilePlayer({ src, title, size }: VideoFilePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { failed, retry } = useVideoRecovery(videoRef, src);

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
          maxHeight: MAX_HEIGHT[size],
          objectFit: size === 'tile' ? 'contain' : undefined,
          height: size === 'tile' ? '100%' : 'auto',
        }}
      />
      {failed && (
        <div role="status" style={overlayStyle}>
          {/* Миниатюра в 96px вмещает только кнопку. */}
          {size !== 'thumb' && (
            <p style={{ margin: 0 }}>
              <RichText text={VIDEO_DROPPED_TEXT} />
            </p>
          )}
          <Button variant="secondary" onClick={retry}>
            {RETRY_LABEL}
          </Button>
        </div>
      )}
    </div>
  );
}
