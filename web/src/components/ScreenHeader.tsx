// Шапка экрана-раздела: заголовок антиквой, строка объяснения под ним и
// главное действие справа (макет Main.dc.html). Один блок на «Экзамены»,
// «Вопросы», «Занятия», «Расписание» — те же три элемента в нескольких
// файлах jscpd ловит как дубль (CLAUDE.md «Одна механика — один компонент»).
//
// Объяснение — часть шапки, а не спрятанное «О разделе»: CLAUDE.md «Каждая
// фича объясняет откуда это и зачем до первого действия». Приписка (`hint`)
// — для того, что читают один раз: часовой пояс школы под «Занятиями».
import type { CSSProperties, ReactNode } from 'react';
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
const titleColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 0,
  maxWidth: 620,
};

interface ScreenHeaderProps {
  title: string;
  explanation: string;
  /** Тихая приписка под объяснением; `null`/пусто — не рисуется. */
  hint?: string | null;
  /** Пока список грузится, действия нет: нажимать не на что. */
  action?: ReactNode;
}

export function ScreenHeader({ title, explanation, hint, action }: ScreenHeaderProps) {
  return (
    <div style={rowStyle}>
      <div style={titleColumnStyle}>
        <h1 style={screenTitleStyle}>{title}</h1>
        <p style={screenExplanationStyle}>{explanation}</p>
        {hint && <p style={screenHintStyle}>{hint}</p>}
      </div>
      {action}
    </div>
  );
}
