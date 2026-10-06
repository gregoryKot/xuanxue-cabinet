// Экран «Доска» — первый экран ученика (ADR-0173): всё, что ждёт его сейчас,
// на одном экране. Сверху вниз: объявление школы (если есть), экзамены к
// сдаче, оплата за месяц (только ученику), ближайшее занятие. Порядок — по
// срочности: что сдавать и платить, потом когда прийти. Каждая секция — свой
// компонент со своим хуком данных, экран только раскладывает.
// Для штата в режиме ученика (ADR-0163) карточки оплаты нет: деньги в режим
// не входят, сервер ответил бы отказом (isPaymentContactVisible).
// Объявление при сбое загрузки даёт баннер с повтором, при отсутствии —
// ничего; во время загрузки места под него не резервируем: секции может не
// быть вовсе, и скелетон мигнул бы впустую.
import { useAuth } from '../auth/AuthProvider';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { isPaymentContactVisible } from '../student/myPaymentsVisibility';
import { BoardExamsSection } from './BoardExamsSection';
import { BoardNextLesson } from './BoardNextLesson';
import { BoardNoticeCard } from './BoardNoticeCard';
import { BoardPaymentCard } from './BoardPaymentCard';
import { useMyBoard } from './useMyBoard';

const TITLE = 'Доска';
// Объяснение называет, что здесь лежит, и в каком порядке читать: ученик
// открывает кабинет с телефона узнать, что от него ждут (ADR-0173).
const EXPLANATION =
  'Здесь то, что ждёт вас сейчас: **экзамены к сдаче**, оплата за месяц и ' +
  'объявления школы. Ближайшее занятие — внизу.';

export default function BoardScreen() {
  const { me } = useAuth();
  const { data: board, error, reload } = useMyBoard();

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader title={TITLE} explanation={EXPLANATION} />

      {error && (
        <LoadErrorBanner
          message={error}
          onRetry={() => void reload()}
          retryLabel="Обновить"
        />
      )}
      {board?.notice && <BoardNoticeCard notice={board.notice} />}

      <BoardExamsSection />
      {isPaymentContactVisible(me) && <BoardPaymentCard />}
      <BoardNextLesson />
    </section>
  );
}
