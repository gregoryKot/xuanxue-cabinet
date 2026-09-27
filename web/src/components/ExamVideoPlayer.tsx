// Плеер видео вопроса/варианта (ADR-0133) — одна механика на весь кабинет
// (CLAUDE.md «Одна механика — один компонент»): редактор вопроса, экран
// сдачи, предпросмотр и карточка проверки показывают одно и то же видео по
// его источнику, не пишут `<video>`/embed каждый сам.
//
// `videoId` — файл в R2, отдаётся через `/api/exam-videos/:id` (302 на
// подписанную ссылку, ADR-0133): нативный `<video controls>` перематывает и
// переспрашивает адрес на каждый seek сам, отдельного плеера не нужно.
// `videoUrl` — ссылка (YouTube и т.п.), плеер — общий VideoEmbed.tsx (фасад,
// ADR-0100): свой встроенный плеер сюда не пишем, чтобы не завести вторую
// реализацию одного и того же.
import type { CSSProperties } from 'react';
import { examVideoSrc } from '../api/examVideoPaths';
import { VideoEmbed } from './VideoEmbed';

type ExamVideoPlayerSize = 'thumb' | 'tile' | 'full';

// 'thumb' — миниатюра в списке (тот же кегль, что OptionImage 'thumb');
// 'tile' — вписывается в высоту плитки варианта (attempt/AttemptOptionTile.tsx,
// класс `.xuanxue-option-tile-media` в index.css задаёт высоту коробки);
// 'full' (по умолчанию) — во всю ширину колонки, естественная высота под
// вопросом или в поле редактора.
const MAX_HEIGHT: Record<ExamVideoPlayerSize, string> = {
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

interface ExamVideoPlayerProps {
  videoId?: string;
  videoUrl?: string;
  /** Доступное имя видео — формулировка вопроса или подпись варианта. */
  title?: string;
  size?: ExamVideoPlayerSize;
}

export function ExamVideoPlayer({
  videoId,
  videoUrl,
  title,
  size = 'full',
}: ExamVideoPlayerProps) {
  if (videoId) {
    return (
      // Субтитров нет: это короткий клип движения без речи (ADR-0133,
      // «Контекст» — «референс учителя»), а не запись занятия с голосом.
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        controls
        preload="metadata"
        playsInline
        src={examVideoSrc(videoId)}
        aria-label={title}
        style={{
          ...baseStyle,
          maxHeight: MAX_HEIGHT[size],
          objectFit: size === 'tile' ? 'contain' : undefined,
          height: size === 'tile' ? '100%' : 'auto',
        }}
      />
    );
  }
  if (videoUrl) {
    return <VideoEmbed url={videoUrl} title={title} />;
  }
  return null;
}
