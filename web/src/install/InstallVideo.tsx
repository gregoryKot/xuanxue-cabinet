// Ролик установки под шагами экрана «Приложение на телефоне»: идёт сам, по
// кругу и без звука — со звуком браузер автозапуск не даст; мелодию включает
// кнопка под ним. При «меньше движения» (CLAUDE.md «Доступность») ролик стоит
// и запускается кнопкой самого плеера.
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Button } from '../components/Button';
import { RichText } from '../components/RichText';
import { screenExplanationStyle } from '../components/screenLayout';
import type { InstallBrowser } from '../pwa/installEnvironment';
import {
  VIDEO_LABEL,
  VIDEO_SOUND_OFF,
  VIDEO_SOUND_ON,
  videoCaption,
} from './installAppCopy';
import { INSTALL_VIDEOS } from './installVideos';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
// Ролик вертикальный, 720×1280: на 360 px во всю ширину он занял бы полтора
// экрана, поэтому ширина ограничена, а место под него занято заранее
// пропорцией — страница не прыгает, когда приходит первый кадр.
const VIDEO_MAX_WIDTH_PX = 280;

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 8,
};
const compactWrapStyle: CSSProperties = { ...wrapStyle, alignItems: 'center' };
const videoStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: VIDEO_MAX_WIDTH_PX,
  aspectRatio: '9 / 16',
  borderRadius: 'var(--radius-block)',
  border: '1px solid var(--line)',
  background: 'var(--paper)',
};

// В окне поверх экрана (InstallVideoDialog.tsx) ролик обязан уместиться
// вместе с заголовком и кнопками на низком телефоне, поэтому меряется высотой
// экрана, а ширина следует за пропорцией.
const compactVideoStyle: CSSProperties = {
  ...videoStyle,
  width: 'auto',
  maxWidth: '100%',
  height: '50vh',
  maxHeight: 460,
};

interface InstallVideoProps {
  browser: InstallBrowser;
  /** Ролик в окне поверх экрана — ниже и по центру. */
  compact?: boolean;
}

export function InstallVideo({ browser, compact = false }: InstallVideoProps) {
  const [muted, setMuted] = useState(true);
  const still = window.matchMedia(REDUCED_MOTION_QUERY).matches;
  const { src, browserName } = INSTALL_VIDEOS[browser];

  return (
    <div style={compact ? compactWrapStyle : wrapStyle}>
      {/* В окне подписи нет: браузер называет плашка в самом ролике, а место
          на низком телефоне нужно кадру. */}
      {!compact && (
        <p style={screenExplanationStyle}>
          <RichText text={videoCaption(browserName)} />
        </p>
      )}
      {/* Речи в ролике нет, только мелодия, а его текст — шаги выше:
          субтитрам передавать нечего. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={src}
        muted={muted}
        autoPlay={!still}
        controls={still}
        loop
        playsInline
        preload="metadata"
        aria-label={VIDEO_LABEL}
        style={compact ? compactVideoStyle : videoStyle}
      />
      <Button
        variant="secondary"
        aria-pressed={!muted}
        onClick={() => setMuted((value) => !value)}
      >
        {muted ? VIDEO_SOUND_ON : VIDEO_SOUND_OFF}
      </Button>
    </div>
  );
}
