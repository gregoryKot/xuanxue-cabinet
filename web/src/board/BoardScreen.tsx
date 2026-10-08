// Экран «Главная» — первый экран при любом входе: ученика (ADR-0173) и штата
// (ADR-0174). Адрес `/board` и имена файлов остались от прежнего названия
// «Доска» — ADR-0178: адрес сохранён в закладках и ссылках, а человеку он не
// виден. Один маршрут и одна шапка — заголовок без объяснения: плитки ниже
// подписаны сами. Что ниже, решает роль (isTeacher, screenAccess.ts): ученику —
// объявление школы, экзамены к сдаче, оплата, события, ближайшее занятие, и
// только то, что к нему относится (StudentBoard.tsx); штату — объявление с
// правкой на месте, очередь проверки, события с кнопкой «Добавить» и входы в
// занятия, рассылки, материалы, школу (StaffBoard.tsx, читает GET /settings).
// Штат в режиме ученика (ADR-0163) приходит с пустыми ролями и видит главную
// ученика.
import { useAuth } from '../auth/AuthProvider';
import { isTeacher } from '../app/screenAccess';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { StaffBoard } from './StaffBoard';
import { StudentBoard } from './StudentBoard';

const TITLE = 'Главная';

export default function BoardScreen() {
  const { me } = useAuth();

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader title={TITLE} />
      {isTeacher(me) ? <StaffBoard /> : <StudentBoard me={me} />}
    </section>
  );
}
