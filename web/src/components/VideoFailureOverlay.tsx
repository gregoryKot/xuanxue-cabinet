// Плашка поверх видео, которое не играет (ADR-0165, «Плеер»). Два отказа —
// два разных ответа, потому что помогают им разные вещи:
// - обрыв связи: «Загрузить снова» (useVideoRecovery.ts сам перезагрузил три
//   раза и сдался) и «Скачать» — менеджер загрузок браузера на слабой связи
//   докачивает файл сам;
// - формат не открывается (iPhone HEVC в Firefox, часть Windows): перезагрузка
//   бесполезна, остаётся «Скачать» — файл откроет системный плеер.
// Видео-ответ ученика и видео вопроса отдаёт один и тот же адрес с `?download=1`
// (videoDownloadHref), поэтому плашке достаточно `src` плеера.
import type { CSSProperties } from 'react';
import { videoDownloadHref } from '../api/examVideoPaths';
import { Button, buttonSurfaceStyle } from './Button';
import { RichText } from './RichText';
import type { VideoFileSize } from './videoFileSize';
import type { VideoFailure } from './videoRecoveryRules';

const NETWORK_TEXT =
  'Видео не догрузилось — связь оборвалась. Продолжится **с того же места**';
const UNSUPPORTED_TEXT =
  'Этот браузер не открывает такое видео. Скачайте его — оно откроется **в плеере телефона или компьютера**';
// Плитка в 160px высотой не вмещает длинный текст рядом с кнопкой.
const UNSUPPORTED_TILE_TEXT = 'Браузер не открывает это видео';
const RETRY_LABEL = 'Загрузить снова';
const DOWNLOAD_LABEL = 'Скачать';

interface Content {
  text: string | null;
  retry: boolean;
  download: boolean;
}

// Что помещается на плашке. Миниатюра в 96px вмещает одну кнопку без текста.
// Плитка (132–160px шириной, 160px высотой): две кнопки и текст вместе не
// влезают, поэтому при обрыве у неё только кнопки, а при неподдерживаемом
// формате — короткий текст и «Скачать», без него одна кнопка ничего не
// объясняет. Во всю ширину места хватает на всё.
const CONTENT: Record<VideoFailure, Record<VideoFileSize, Content>> = {
  network: {
    thumb: { text: null, retry: true, download: false },
    tile: { text: null, retry: true, download: true },
    full: { text: NETWORK_TEXT, retry: true, download: true },
  },
  unsupported: {
    thumb: { text: null, retry: false, download: true },
    tile: { text: UNSUPPORTED_TILE_TEXT, retry: false, download: true },
    full: { text: UNSUPPORTED_TEXT, retry: false, download: true },
  },
};

// Плашка непрозрачная: под ней у оборванного видео всё равно чёрное поле.
// Кегль и поля поджаты под плитку. Содержимое центрируется автоотступом, а не
// `justify-content: center`: если на узком экране оно всё же не уместится,
// плашка прокручивается, а верх не обрезается без возможности до него долистать.
const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  overflowY: 'auto',
  padding: '8px 12px',
  borderRadius: 'var(--radius-card)',
  background: 'var(--panel)',
  color: 'var(--ink)',
  fontSize: 13,
  lineHeight: 1.3,
};

const contentStyle: CSSProperties = {
  margin: 'auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  textAlign: 'center',
};

const controlsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: 8,
};

// Та же вторичная кнопка, что у «Загрузить снова», но настоящая ссылка: файл
// скачивает навигация браузера, а не наш код.
const downloadLinkStyle: CSSProperties = {
  ...buttonSurfaceStyle('secondary'),
  textDecoration: 'none',
};

interface VideoFailureOverlayProps {
  failure: VideoFailure;
  /** Адрес видео, как у `<video src>` — ссылка «Скачать» строится от него. */
  src: string;
  size: VideoFileSize;
  onRetry: () => void;
}

export function VideoFailureOverlay({
  failure,
  src,
  size,
  onRetry,
}: VideoFailureOverlayProps) {
  const { text, retry, download } = CONTENT[failure][size];
  return (
    <div role="status" style={overlayStyle}>
      <div style={contentStyle}>
        {text && (
          <p style={{ margin: 0 }}>
            <RichText text={text} />
          </p>
        )}
        <div style={controlsStyle}>
          {retry && (
            <Button variant="secondary" onClick={onRetry}>
              {RETRY_LABEL}
            </Button>
          )}
          {download && (
            // Обычная ссылка, не apiFetch: сервер отвечает 302 на подписанный адрес
            // в другом домене, а `connectSrc: 'self'` в CSP (api/src/security/csp.ts)
            // оборвал бы такой редирект у fetch — навигация по <a href> под CSP не
            // ограничена. Тот же приём, что у файлов материалов.
            <a href={videoDownloadHref(src)} style={downloadLinkStyle}>
              {DOWNLOAD_LABEL}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
