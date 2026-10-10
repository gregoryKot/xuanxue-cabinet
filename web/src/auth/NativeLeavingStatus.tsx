// Вкладка уходит в Daychi на `continue` (ADR-0181): с экрана `/login/native`
// после входа или отказа и со страницы возврата Google после отмены у
// провайдера. Переход в Daychi по его схеме адреса страницу не выгружает,
// поэтому строка остаётся верной, даже если вкладка так и стоит открытой.
import { EntryColumn } from '../components/EntryColumn';
import { screenExplanationStyle, screenTitleStyle } from '../components/screenLayout';

export const NATIVE_LOGIN_TITLE = 'Вход в приложение Daychi';
const LEAVING_MESSAGE =
  'Открываем Daychi. Если приложение не открылось само, перейдите в него.';

export function NativeLeavingStatus() {
  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>{NATIVE_LOGIN_TITLE}</h1>
      <p role="status" style={screenExplanationStyle}>
        {LEAVING_MESSAGE}
      </p>
    </EntryColumn>
  );
}
