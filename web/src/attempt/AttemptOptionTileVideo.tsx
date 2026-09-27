// Плитка варианта с видео (ADR-0133) — вынесена из AttemptOptionTile.tsx
// (файловый храповик, CLAUDE.md «Храповики»): видео, в отличие от картинки,
// интерактивно (перемотка, пауза своими элементами управления) — вложить его
// в тот же `<label>`, что толкует любой клик как выбор варианта, значило бы
// ловить нажатие на плеер как отметку «выбрано». Плеер стоит вне `<label>`, а
// цель выбора — отдельная строка под ним, с гарантированной высотой 44
// (CLAUDE.md «Доступность»): у картинки, которая не перехватывает клик, весь
// тайл остаётся одной целью (см. основной файл).
import type { CSSProperties, ReactNode } from 'react';
import { ExamVideoPlayer } from '../components/ExamVideoPlayer';

interface AttemptOptionTileVideoProps {
  tileStyle: CSSProperties;
  mediaStyle: CSSProperties;
  footStyle: CSSProperties;
  videoId?: string;
  videoUrl?: string;
  label: string;
  disabled?: boolean;
  /** Отметка + подпись — тот же узел, что у плитки-картинки (control в
   * AttemptOptionTile.tsx), просто в своей `<label>` поменьше. */
  control: ReactNode;
}

export function AttemptOptionTileVideo({
  tileStyle,
  mediaStyle,
  footStyle,
  videoId,
  videoUrl,
  label,
  disabled,
  control,
}: AttemptOptionTileVideoProps) {
  return (
    <div className="xuanxue-option-tile" style={tileStyle}>
      <span className="xuanxue-option-tile-media" style={mediaStyle}>
        <ExamVideoPlayer
          videoId={videoId}
          videoUrl={videoUrl}
          title={label}
          size="tile"
        />
      </span>
      <label
        style={{ ...footStyle, minHeight: 44, cursor: disabled ? 'default' : 'pointer' }}
      >
        {control}
      </label>
    </div>
  );
}
