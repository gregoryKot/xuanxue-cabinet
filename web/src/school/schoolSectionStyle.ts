// Раздел экрана «Школа» — волосяная линия сверху, колонка с промежутком, как
// у разделов «Шаблонов» (editorSectionStyle). Один объект на все разделы
// экрана, а не копия в каждом файле (jscpd, CLAUDE.md «Дубли»).
import type { CSSProperties } from 'react';
import { editorSectionStyle } from '../components/editorLayout';

export const schoolSectionStyle: CSSProperties = {
  ...editorSectionStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};
