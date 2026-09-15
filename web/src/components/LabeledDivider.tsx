// Волосяная линия с подписью посередине («или по почте») — разделяет два
// равных пути входа на LoginScreen.tsx и JoinScreen.tsx (CLAUDE.md «Одна
// механика — один компонент»).
//
// Линия собрана из двух отрезков по бокам подписи, а не из сплошной линии с
// подложкой под текстом: подложку пришлось бы красить в цвет страницы, и на
// любом другом фоне разделитель развалился бы на линию и прямоугольник.
import type { CSSProperties } from 'react';

const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 };
const lineStyle: CSSProperties = { flex: 1, height: 1, background: 'var(--line)' };

export function LabeledDivider({ label }: { label: string }) {
  return (
    <div style={rowStyle}>
      <span style={lineStyle} />
      <span className="xuanxue-eyebrow">{label}</span>
      <span style={lineStyle} />
    </div>
  );
}
