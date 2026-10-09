// Объявление ученикам на главной штата вместе с загрузкой настроек школы
// (ADR-0172 дополнение, ADR-0178): вынесено из StaffBoard.tsx, чтобы скрытая
// человеком плитка (ADR-0179) вообще не монтировалась и не звала `GET /settings`.
// Объявлению нужны настройки школы целиком, поэтому штат читает их, а не
// `GET /me/board` ученика.
import { useSettings } from '../templates/useSettings';
import { BoardLoadError } from './BoardLoadError';
import { StaffBoardNotice } from './StaffBoardNotice';

export function StaffBoardNoticeSection() {
  const settingsState = useSettings();

  return (
    <>
      {settingsState.error && (
        <BoardLoadError
          message={settingsState.error}
          onRetry={() => void settingsState.reload()}
        />
      )}
      {/* Пока настройки грузятся, места под объявление не резервируем:
          объявления может не быть вовсе, а карточка-плюс появится вместе с
          настройками. */}
      {settingsState.settings && (
        <StaffBoardNotice
          settings={settingsState.settings}
          update={settingsState.update}
          now={new Date()}
        />
      )}
    </>
  );
}
