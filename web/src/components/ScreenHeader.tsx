// Шапка экрана-раздела: заголовок антиквой, строка объяснения под ним и
// главное действие справа (макет Main.dc.html). Один блок на «Экзамены»,
// «Вопросы», «Занятия», «Расписание» — те же три элемента в нескольких
// файлах jscpd ловит как дубль (CLAUDE.md «Одна механика — один компонент»).
//
// Объяснение — часть шапки, а не спрятанное «О разделе»: CLAUDE.md «Каждая
// фича объясняет откуда это и зачем до первого действия». Приписка (`hint`)
// — для того, что читают один раз: часовой пояс школы под «Занятиями».
//
// `explanation` и `hint` идут через RichText.tsx: это общая шапка всех
// разделов, и акцент `**жирным**` в объяснении должен доставаться каждому
// экрану сам, через этот один файл, а не копией в каждом — CLAUDE.md «Одна
// механика — один компонент».
import type { CSSProperties, ReactNode } from 'react';
import { RichText } from './RichText';
import {
  screenExplanationStyle,
  screenHintStyle,
  screenTitleStyle,
} from './screenLayout';

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: 20,
};
// `flex: 1 1 …` обязателен: без него колонка заголовка занимает ширину по
// содержимому, и длинное объяснение (список каналов) сталкивает действие на
// следующую строку — кнопка оказывается под текстом, а не справа, как на
// «Занятиях» (отзыв владельца 2026-09-16). База в пикселях — порог, ниже
// которого перенос всё-таки нужен: на 360 px кнопке рядом уже не поместиться.
const TITLE_COLUMN_MIN_WIDTH_PX = 260;

// Ширина колонки заголовка по умолчанию — общая для «Экзаменов», «Рассылок»,
// «Расписания». «Занятия» (макет 1c-planning.html, docs/adr/0043) рисуют
// более узкий блок текста (540) — проп, а не правка общего числа: у остальных
// уже переехавших экранов длина объяснений подобрана под 620 (отзыв
// владельца 2026-09-16, шапка файла), трогать её ради одного нового экрана
// незачем.
const DEFAULT_TITLE_MAX_WIDTH_PX = 620;

const titleColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  flex: `1 1 ${TITLE_COLUMN_MIN_WIDTH_PX}px`,
  minWidth: 0,
};

interface ScreenHeaderProps {
  title: string;
  /** Не у каждого экрана есть что сказать сверх заголовка и содержимого —
   * не рисуется, если не задано (docs/VOICE.md: абзац, который не говорит,
   * что делать, — шум). */
  explanation?: string;
  /** Тихая приписка под объяснением; `null`/пусто — не рисуется. */
  hint?: string | null;
  /** Пока список грузится, действия нет: нажимать не на что. */
  action?: ReactNode;
  /** Предел ширины блока заголовка+объяснения — по умолчанию 620px. */
  titleMaxWidth?: number;
}

export function ScreenHeader({
  title,
  explanation,
  hint,
  action,
  titleMaxWidth = DEFAULT_TITLE_MAX_WIDTH_PX,
}: ScreenHeaderProps) {
  return (
    <div style={rowStyle}>
      <div style={{ ...titleColumnStyle, maxWidth: titleMaxWidth }}>
        <h1 style={screenTitleStyle}>{title}</h1>
        {explanation && (
          <p style={screenExplanationStyle}>
            <RichText text={explanation} />
          </p>
        )}
        {hint && (
          <p style={screenHintStyle}>
            <RichText text={hint} />
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
