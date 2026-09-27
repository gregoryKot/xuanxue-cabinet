// Одна плитка варианта-картинки (экран сдачи и предпросмотр «глазами
// ученика» — тот же компонент, exams/ExamPreviewQuestion.tsx). До этой
// правки Toggle.tsx рисовал такой вариант колонкой «контрол сверху —
// картинка снизу»: на экране кружок визуально прилипал к ЧУЖОЙ картинке над
// ним, а своя стояла ниже — непонятно, что к чему относится (жалоба
// владельца со снимком, docs/adr/0105). Здесь картинка и её отметка лежат в
// одной карточке: перепутать соседнюю плитку с этой нельзя.
//
// Отметка — строкой ПОД картинкой, не углом поверх неё: поверх она бы
// перекрывала часть фото (стойку, форму рук), а на светлом кадре ещё и
// терялась бы сама (та же причина отклонена как альтернатива в docs/adr/0105).
//
// `aria-hidden` на картинке — тот же приём и та же причина, что в
// Toggle.tsx: `alt` картинки слово в слово повторяет `label`
// (formatOptionLabel, ADR-0035), и без `aria-hidden` скринридер зачитывал бы
// подпись дважды подряд у одного контрола.
//
// `<input>` спрятан визуально (`xuanxue-sr-only`), а не заменён на `<div>` с
// ARIA: настоящий чекбокс/радио сам даёт клавиатуре и скринридеру всё, что
// нужно — фокус, Space/Enter, состояние «отмечено», взаимное исключение
// внутри `name` (CLAUDE.md «Доступность»); имитировать это вручную значит
// повторить работу браузера и рано или поздно разойтись с ней.
import type { CSSProperties } from 'react';
import { OptionImage } from '../components/OptionImage';
import { AttemptOptionTileVideo } from './AttemptOptionTileVideo';
import { captionStyle, footStyle, mediaStyle } from './attemptOptionTileStyles';
import { CheckMark } from './OptionCheckMark';

const TILE_GAP_PX = 6;
const TILE_PADDING_PX = 8;
const MARK_SIZE_PX = 22;
const MARK_BORDER_WIDTH_PX = 2;
// Квадратик со скруглением у чекбокса (не идеальный прямоугольник) — форма
// сама отличает «можно несколько» от «один вариант» (кружок), как у
// нативных контролов, ещё до чтения подписи.
const CHECKBOX_MARK_RADIUS_PX = 6;

interface AttemptOptionTileProps {
  /** formatOptionLabel (ADR-0035) — видимая подпись или, у варианта-картинки
   * без своего текста, только доступное имя контрола («Вариант N»). */
  label: string;
  /** У варианта-картинки без своего текста подпись «Вариант N» не несёт
   * ничего нового рядом с самой картинкой (отзыв владельца 2026-09-19) —
   * прячется визуально, остаётся доступным именем. */
  labelHidden: boolean;
  imageId?: string;
  /** Видео варианта (ADR-0133) тем же смыслом, что `imageId`: не больше
   * одного медиа на вариант, показывает ExamVideoPlayer. У видео своя
   * структура плитки — см. комментарий у `hasVideo` ниже. */
  videoId?: string;
  videoUrl?: string;
  checked: boolean;
  disabled?: boolean;
  /** Задано — радио из группы с таким именем, нет — самостоятельный чекбокс
   * (тот же приём, что у Toggle.tsx). */
  name?: string;
  onChange: (checked: boolean) => void;
}

export function AttemptOptionTile({
  label,
  labelHidden,
  imageId,
  videoId,
  videoUrl,
  checked,
  disabled,
  name,
  onChange,
}: AttemptOptionTileProps) {
  const hasVideo = Boolean(videoId || videoUrl);
  const tileStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: TILE_GAP_PX,
    padding: TILE_PADDING_PX,
    background: 'var(--card)',
    borderRadius: 'var(--radius-card)',
    minWidth: 0,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    // Кольцо тенью, а не рамкой: рамка добавила бы 2px и сдвинула бы
    // содержимое плитки при выборе, тень накладывается поверх без сдвига.
    boxShadow: checked
      ? 'var(--shadow-card), 0 0 0 2px var(--terracotta)'
      : 'var(--shadow-card)',
  };
  const markStyle: CSSProperties = {
    width: MARK_SIZE_PX,
    height: MARK_SIZE_PX,
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `${MARK_BORDER_WIDTH_PX}px solid var(--control-border)`,
    background: checked ? 'var(--terracotta)' : 'var(--card)',
    borderColor: checked ? 'var(--terracotta)' : 'var(--control-border)',
    borderRadius: name ? 'var(--radius-pill)' : CHECKBOX_MARK_RADIUS_PX,
  };

  const control = (
    <>
      <input
        type={name ? 'radio' : 'checkbox'}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="xuanxue-sr-only"
      />
      <span style={markStyle} aria-hidden="true">
        {checked && <CheckMark />}
      </span>
      <span className={labelHidden ? 'xuanxue-sr-only' : undefined} style={captionStyle}>
        {label}
      </span>
    </>
  );

  // Видео — своя структура плитки (AttemptOptionTileVideo.tsx): плеер вне
  // `<label>`, цель выбора — отдельная строка под ним.
  if (hasVideo) {
    return (
      <AttemptOptionTileVideo
        tileStyle={tileStyle}
        videoId={videoId}
        videoUrl={videoUrl}
        label={label}
        disabled={disabled}
        control={control}
      />
    );
  }

  return (
    <label className="xuanxue-option-tile" style={tileStyle}>
      {imageId && (
        <span className="xuanxue-option-tile-media" style={mediaStyle} aria-hidden="true">
          <OptionImage imageId={imageId} size="tile" alt={label} />
        </span>
      )}
      <span style={footStyle}>{control}</span>
    </label>
  );
}
