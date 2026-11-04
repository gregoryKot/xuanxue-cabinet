// Главная штата (ADR-0174, владелец 2026-10-06: «доска стала главным экраном
// при любом входе. у учителя там кнопки настроить расписание, рассылки,
// материалы — из навигации можно убрать»; название «Главная» и плитки без
// рубрик — ADR-0178). Самой первой стоит «Расписание и рассылки» (/schedule,
// ADR-0191): владелец 2026-11-04 «подними в самый верх» — это основной рабочий
// раздел учителя. Дальше объявление ученикам (StaffBoardNoticeSection.tsx,
// ADR-0172 дополнение); «Проверка» с числом работ (StaffBoardGrading.tsx);
// события и «Добавить событие» (StaffBoardEvents.tsx, ADR-0177); внизу сеткой в
// две колонки на широком экране входы «Занятия» (/planning; «Расписание» —
// только кнопка в его шапке, ADR-0176), «Материалы» и «Школа» (ADR-0176).
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
// «Расписание и рассылки» вынесено отдельно — над объявлением, один источник
// данных на обе позиции (SCHEDULE_LINK), строки не дублируются.
const SCHEDULE_LINK = {
  to: '/schedule',
  title: 'Расписание и рассылки',
  hint: 'Постоянные занятия недели и **куда уходят** ссылки и записи; журнал отправок, шаблоны, каналы.',
};

const SETUP_LINKS = [
  {
    to: '/planning',
    title: 'Занятия',
    hint: 'Занятия на **четыре недели**, темы и записи; внутри — разовое занятие.',
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
      <SectionLink
        to={SCHEDULE_LINK.to}
        title={SCHEDULE_LINK.title}
        hint={SCHEDULE_LINK.hint}
      />
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
