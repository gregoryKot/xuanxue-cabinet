// Секция доски: рубрика над содержимым — `<h2>` с `.xuanxue-eyebrow`, как у
// групп на «Заданиях» (TasksScreen.tsx); на экране один `<h1>`, у самой
// «Доски». Один каркас на «Сдавать сейчас», «Оплату» и «Ближайшее занятие»
// (ADR-0173): три копии заголовка с отступами ловил бы jscpd.
import type { CSSProperties, ReactNode } from 'react';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
// У `<h2>` свои отступы от браузера — расстояние держит `gap` колонки.
const headingStyle: CSSProperties = { margin: 0 };

interface BoardSectionProps {
  heading: string;
  children: ReactNode;
}

export function BoardSection({ heading, children }: BoardSectionProps) {
  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={headingStyle}>
        {heading}
      </h2>
      {children}
    </section>
  );
}
