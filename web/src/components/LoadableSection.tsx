// Раздел экрана с данными из сети: рубрика-заголовок, строка «что это и зачем»
// и баннер сбоя загрузки с повтором (CLAUDE.md «Одна механика — один
// компонент»). Один и тот же каркас нужен каждому блоку со своим хуком данных
// («Абонемент» на «Профиле», «О каких занятиях» на «Настройках уведомлений»),
// и jscpd поймал его вторым экземпляром. Скелетон и само содержимое — у
// вызывающего: у каждого своя форма, а каркас от неё не зависит.
// Заголовок — `<h2>` с рубрикой `.xuanxue-eyebrow`, не второй `<h1>`: на экране
// один h1, у самого экрана.
import type { CSSProperties, ReactNode } from 'react';
import { LoadErrorBanner } from './LoadErrorBanner';
import { RichText } from './RichText';
import { screenExplanationStyle } from './screenLayout';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
// У `<h2>` свои отступы от браузера — расстояние держит `gap` колонки.
const headingStyle: CSSProperties = { margin: 0 };

interface LoadableSectionProps {
  heading: string;
  /** Строка с акцентом `**факт**` (ADR-0124): объяснение до первого действия. */
  explanation: string;
  /** Сбой загрузки — баннер с повтором над содержимым; `null` — без баннера. */
  error: string | null;
  onRetry: () => void;
  children: ReactNode;
}

export function LoadableSection({
  heading,
  explanation,
  error,
  onRetry,
  children,
}: LoadableSectionProps) {
  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={headingStyle}>
        {heading}
      </h2>
      <p style={screenExplanationStyle}>
        <RichText text={explanation} />
      </p>
      {error && <LoadErrorBanner message={error} onRetry={onRetry} />}
      {children}
    </section>
  );
}
