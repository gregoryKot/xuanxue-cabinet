// Нумерованный список шагов установки (installAppCopy.ts) — общий рендер для
// iPhone и Android, оба места иначе повторяли бы один и тот же `<ol>` с
// RichText внутри (CLAUDE.md «Одна механика — один компонент», jscpd).
import type { CSSProperties } from 'react';
import { RichText } from '../components/RichText';

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const itemStyle: CSSProperties = { lineHeight: 1.5 };

interface InstallStepsProps {
  steps: string[];
}

export function InstallSteps({ steps }: InstallStepsProps) {
  return (
    <ol style={listStyle}>
      {steps.map((step, index) => (
        <li key={index} style={itemStyle}>
          <RichText text={step} />
        </li>
      ))}
    </ol>
  );
}
