// Стили плитки варианта, общие для плитки-картинки (AttemptOptionTile.tsx)
// и плитки-видео (AttemptOptionTileVideo.tsx, ADR-0133): обе строят одну и ту
// же подпись и отметку, разъехаться им нельзя.
import type { CSSProperties } from 'react';

const FOOT_GAP_PX = 8;
const FOOT_MIN_HEIGHT_PX = 28;
const CAPTION_FONT_SIZE_PX = 14;
const CAPTION_LINE_HEIGHT = 1.35;
export const mediaStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 0,
  // Высоту коробки задаёт класс xuanxue-option-tile-media в index.css
  // (CSSProperties не умеет медиа-запрос) — здесь только обрезка того, что в
  // неё не вписалось по ширине.
  overflow: 'hidden',
};
export const footStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: FOOT_GAP_PX,
  minHeight: FOOT_MIN_HEIGHT_PX,
};
export const captionStyle: CSSProperties = {
  fontSize: CAPTION_FONT_SIZE_PX,
  lineHeight: CAPTION_LINE_HEIGHT,
};
