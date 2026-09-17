// Переход в сетку расписания — низ экрана «Занятия». Разметку и линию даёт
// общий components/SectionLink.tsx (та же ссылка с объяснением стоит внизу
// «Рассылок»), здесь — только тексты этого раздела.
import { SectionLink } from '../components/SectionLink';

const TITLE = 'Сетка расписания';
const HINT = 'Дни, время, ссылки Zoom, ведущие. Из них рождаются занятия здесь.';

export function ScheduleLink() {
  return <SectionLink to="/schedule" title={TITLE} hint={HINT} />;
}
