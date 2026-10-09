// Главная штата (ADR-0174, владелец 2026-10-06: «доска стала главным экраном
// при любом входе. у учителя там кнопки настроить расписание, рассылки,
// материалы — из навигации можно убрать»; название «Главная» и плитки без
// рубрик — ADR-0178). Сверху объявление ученикам — то же, что видит ученик, и
// здесь же правится (StaffBoardNoticeSection.tsx, ADR-0172 дополнение); дальше
// «Проверка» с числом работ на проверке (StaffBoardGrading.tsx); ближайшие
// события и карточка «Добавить событие» (StaffBoardEvents.tsx, ADR-0177);
// карточки-входы в разделы, ушедшие из панели, сеткой в две колонки на широком
// экране: «Занятия» (/planning; «Расписание» — только кнопка в его шапке,
// ADR-0176), «Рассылки», «Материалы» и «Школа» — настройки школы (ADR-0176).
// Карточки — общий SectionLink (CLAUDE.md «Одна механика — один компонент»).
//
// Человек может скрыть объявление, проверку и события (ADR-0179): скрытая плитка
// не монтируется, значит и не запрашивается. Входы в разделы не скрываются —
// это единственная дорога в разделы, которых нет в панели.
import type { HomeTileKey } from '@xuanxue/shared';
import { SectionLink } from '../components/SectionLink';
import { StaffBoardEvents } from './StaffBoardEvents';
import { StaffBoardGrading } from './StaffBoardGrading';
import { StaffBoardNoticeSection } from './StaffBoardNoticeSection';

// Подписи говорят, что внутри раздела, одной строкой — чтобы за пять секунд
// было понятно, куда нажать (CLAUDE.md «Каждая фича объясняет…»).
const SETUP_LINKS = [
  {
    to: '/planning',
    title: 'Занятия',
    hint: 'Занятия на **четыре недели**, темы и записи; внутри — разовое занятие и постоянное расписание.',
  },
  {
    to: '/broadcasts',
    title: 'Рассылки',
    hint: 'Журнал отправок, шаблоны постов и каналы.',
  },
  {
    to: '/materials',
    title: 'Материалы',
    hint: 'Книги, статьи и видео для учеников.',
  },
  // Настройки школы (ADR-0176): раньше лежали на «Шаблонах» под «Рассылками».
  {
    to: '/school',
    title: 'Школа',
    hint: 'Кому платить, напоминание об оплате, контакт для новичков, сайт.',
  },
];

interface StaffBoardProps {
  hidden: readonly HomeTileKey[];
}

export function StaffBoard({ hidden }: StaffBoardProps) {
  return (
    <>
      {!hidden.includes('notice') && <StaffBoardNoticeSection />}
      {!hidden.includes('grading') && <StaffBoardGrading />}
      {!hidden.includes('events') && <StaffBoardEvents />}

      <div className="xuanxue-block-grid">
        {SETUP_LINKS.map((link) => (
          <SectionLink key={link.to} to={link.to} title={link.title} hint={link.hint} />
        ))}
      </div>
    </>
  );
}
