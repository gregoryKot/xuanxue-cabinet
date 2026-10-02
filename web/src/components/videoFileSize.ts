// Размеры нативного `<video>` из файла — общие для VideoFilePlayer.tsx и его
// плашки отказа (VideoFailureOverlay.tsx): плашка зависит от размера, а тип в
// самом плеере вернул бы циклический импорт.

// 'thumb' — миниатюра в списке (тот же кегль, что OptionImage 'thumb');
// 'tile' — вписывается в высоту плитки варианта (attempt/AttemptOptionTile.tsx,
// класс `.xuanxue-option-tile-media` в index.css задаёт высоту коробки);
// 'full' (по умолчанию) — во всю ширину колонки, естественная высота под
// вопросом или в поле редактора.
export type VideoFileSize = 'thumb' | 'tile' | 'full';

export const VIDEO_MAX_HEIGHT: Record<VideoFileSize, string> = {
  thumb: '96px',
  tile: '100%',
  full: 'none',
};
