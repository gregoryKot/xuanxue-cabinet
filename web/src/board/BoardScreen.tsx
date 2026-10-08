// Экран «Доска» — первый экран при любом входе: ученика (ADR-0173) и штата
// (ADR-0174). Один маршрут и одна шапка; что ниже, решает роль (isTeacher,
// screenAccess.ts): ученику — объявление школы (BoardNotice.tsx, GET
// /me/board), экзамены к сдаче, оплата, события школы, ближайшее занятие
// (StudentBoard.tsx); штату — то же объявление с правкой на месте, очередь
// проверки, события с кнопкой «Добавить» и входы в занятия, рассылки,
// материалы (StaffBoard.tsx, читает GET /settings).
// Штат в режиме ученика (ADR-0163) приходит с пустыми ролями и видит доску
// ученика.
import { useAuth } from '../auth/AuthProvider';
import { isTeacher } from '../app/screenAccess';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { BoardNotice } from './BoardNotice';
import { StaffBoard } from './StaffBoard';
import { StudentBoard } from './StudentBoard';

const TITLE = 'Доска';
// Объяснение называет, что здесь лежит, и в каком порядке читать: ученик
// открывает кабинет с телефона узнать, что от него ждут (ADR-0173).
const STUDENT_EXPLANATION =
  'Здесь то, что ждёт вас сейчас: **экзамены к сдаче**, оплата за месяц, ' +
  'объявления и события школы. Ближайшее занятие — внизу.';
// Учителю — что ждёт его и куда идти настраивать (ADR-0174); объявление он
// здесь же и пишет (ADR-0172, дополнение).
const STAFF_EXPLANATION =
  'Здесь объявление ученикам, **работы на проверке** и ближайшие события школы. ' +
  'Ниже — входы в занятия, рассылки, материалы и настройки школы.';

export default function BoardScreen() {
  const { me } = useAuth();
  const staff = isTeacher(me);

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader
        title={TITLE}
        explanation={staff ? STAFF_EXPLANATION : STUDENT_EXPLANATION}
      />
      {staff ? (
        <StaffBoard />
      ) : (
        <>
          <BoardNotice />
          <StudentBoard me={me} />
        </>
      )}
    </section>
  );
}
