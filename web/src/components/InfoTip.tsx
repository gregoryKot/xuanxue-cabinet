// Всплывающая подсказка у подписи поля (ADR-0139) — заменяет подстрочный
// `hint`, который растягивал форму по вертикали (отзыв владельца 2026-09-27).
// Кнопка-«?» рисуется маленькой (18px), а цель нажатия остаётся ≥44×44
// (CLAUDE.md «Доступность») через паддинг и компенсирующий отрицательный
// margin — строка с подписью от этого не раздувается.
//
// Текст поповера — через createPortal в document.body: рядом с <label> он
// склеился бы в доступное имя поля (тот же повод, что увёл `hint` из <label>).
//
// Наведение мыши подключено только когда у устройства есть настоящее
// наведение (`(hover: hover)`) — на тачскрине то же событие иначе приходит
// вместе с кликом и подсказка немедленно закрывалась бы вторым срабатыванием
// (mouseenter открывает, click тут же переключает обратно).
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { RichText } from './RichText';

const ICON_SIZE_PX = 14;
const HIT_TARGET_PX = 44;
// Зона нажатия 44×44 невидима; слева узкая, чтобы не наезжать на подпись.
const HIT_PAD_Y_PX = (HIT_TARGET_PX - ICON_SIZE_PX) / 2;
const HIT_PAD_LEFT_PX = 4;
const HIT_PAD_RIGHT_PX = HIT_TARGET_PX - ICON_SIZE_PX - HIT_PAD_LEFT_PX;
const POPOVER_MAX_WIDTH_PX = 260;
const VIEWPORT_MARGIN_PX = 16;
const POPOVER_GAP_PX = 6;
// Грубая оценка высоты поповера для решения «под кнопкой или над ней» — точной
// высоты до рендера не знаем, а второй проход ради пикселя не стоит сложности.
const ESTIMATED_POPOVER_HEIGHT_PX = 90;

const buttonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: ICON_SIZE_PX,
  height: ICON_SIZE_PX,
  padding: `${HIT_PAD_Y_PX}px ${HIT_PAD_RIGHT_PX}px ${HIT_PAD_Y_PX}px ${HIT_PAD_LEFT_PX}px`,
  margin: `${-HIT_PAD_Y_PX}px ${-HIT_PAD_RIGHT_PX}px ${-HIT_PAD_Y_PX}px ${-HIT_PAD_LEFT_PX}px`,
  // content-box — иначе паддинг съел бы иконку. Без рамки и фона: они
  // рисовались кругом 44px поверх подписи (снимок владельца 2026-09-27).
  boxSizing: 'content-box',
  border: 'none',
  background: 'transparent',
  color: 'var(--ink-faint)',
  cursor: 'pointer',
  flexShrink: 0,
  lineHeight: 0,
};

const popoverStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 1000,
  maxWidth: POPOVER_MAX_WIDTH_PX,
  padding: '10px 12px',
  borderRadius: 'var(--radius-control)',
  border: '1px solid var(--control-border)',
  background: 'var(--card)',
  color: 'var(--ink)',
  fontSize: 13,
  lineHeight: 1.4,
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.16)',
};

function supportsHover(): boolean {
  try {
    return window.matchMedia('(hover: hover)').matches;
  } catch {
    // matchMedia недоступен в части окружений — считаем, что наведения нет
    // (тот же приём, что lib/scrollToFirstAlert.ts для reduced-motion).
    return false;
  }
}

interface Position {
  top: number;
  left: number;
}

function computePosition(button: HTMLElement): Position {
  const rect = button.getBoundingClientRect();
  const left = Math.min(
    Math.max(rect.left, VIEWPORT_MARGIN_PX),
    window.innerWidth - POPOVER_MAX_WIDTH_PX - VIEWPORT_MARGIN_PX,
  );
  const fitsBelow =
    rect.bottom + POPOVER_GAP_PX + ESTIMATED_POPOVER_HEIGHT_PX <= window.innerHeight;
  const top = fitsBelow
    ? rect.bottom + POPOVER_GAP_PX
    : rect.top - POPOVER_GAP_PX - ESTIMATED_POPOVER_HEIGHT_PX;
  return { top, left: Math.max(left, VIEWPORT_MARGIN_PX) };
}

interface InfoTipProps {
  /** Подпись поля — уходит в `aria-label` кнопки («Подсказка: Уровень»):
   * иконка сама по себе неотличима от других на экране скринридером. */
  label: string;
  text: string;
}

export function InfoTip({ label, text }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  // Раз вычислено при монтировании — способность наводить курсор у
  // устройства за время жизни кнопки не меняется.
  const [hoverCapable] = useState(supportsHover);
  // Клик по кнопке в браузере сначала фокусирует её (mousedown → focus), а
  // потом уже стреляет click — без этого флага onFocus открывал бы подсказку
  // за миг до того, как onClick переключит её обратно и закроет тем же
  // касанием. pointerDownRef отличает «фокус пришёл с клика» (обработает сам
  // клик) от «фокус пришёл с Tab» (тогда открывает именно фокус).
  const pointerDownRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setPosition(buttonRef.current ? computePosition(buttonRef.current) : null);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function handlePointerDown(event: PointerEvent) {
      if (buttonRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  function handleButtonKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    // Escape закрывает и тогда, когда фокус ещё на самой кнопке — не только
    // при открытой подсказке через document-обработчик выше.
    if (event.key === 'Escape') setOpen(false);
  }

  function handleFocus() {
    if (pointerDownRef.current) {
      // Фокус — эхо того же клика/тапа: его откроет (или закроет) onClick.
      pointerDownRef.current = false;
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        style={buttonStyle}
        aria-label={`Подсказка: ${label}`}
        aria-describedby={open ? tooltipId : undefined}
        onPointerDown={() => {
          pointerDownRef.current = true;
        }}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleButtonKeyDown}
        onMouseEnter={hoverCapable ? () => setOpen(true) : undefined}
        onMouseLeave={hoverCapable ? () => setOpen(false) : undefined}
        onFocus={handleFocus}
        onBlur={() => setOpen(false)}
      >
        <svg
          width={ICON_SIZE_PX}
          height={ICON_SIZE_PX}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="6" cy="6" r="5.3" />
          <path d="M6 8.6V5.7" />
          <circle cx="6" cy="3.6" r="0.15" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open &&
        position &&
        createPortal(
          <div id={tooltipId} role="tooltip" style={{ ...popoverStyle, ...position }}>
            <RichText text={text} />
          </div>,
          document.body,
        )}
    </>
  );
}
