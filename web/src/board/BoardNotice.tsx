// Объявление школы на доске (ADR-0172) — одна секция на обе доски, ученика
// (ADR-0173) и штата (ADR-0174): запрос GET /me/board, баннер с повтором при
// сбое, карточка при наличии объявления. Объявления нет — ничего; во время
// загрузки места под него не резервируем: секции может не быть вовсе, и
// скелетон мигнул бы впустую. Вынесено из BoardScreen.tsx, когда у доски
// появилась вторая раскладка: иначе блок повторялся бы в обеих.
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { BoardNoticeCard } from './BoardNoticeCard';
import { useMyBoard } from './useMyBoard';

export function BoardNotice() {
  const { data: board, error, reload } = useMyBoard();

  return (
    <>
      {error && (
        <LoadErrorBanner
          message={error}
          onRetry={() => void reload()}
          retryLabel="Обновить"
        />
      )}
      {board?.notice && <BoardNoticeCard notice={board.notice} />}
    </>
  );
}
