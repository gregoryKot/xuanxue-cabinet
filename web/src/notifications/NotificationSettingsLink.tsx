// Тихая ссылка «Настройки уведомлений» внизу ленты (ADR-0162): в ленту человек
// приходит с вопросом «почему мне это пишут» или «почему не пишут», и настройка
// должна быть под рукой. Стоит и при пустой ленте — там вопрос тот же. Текстом с
// линией, не карточкой и без своей разделительной линии: главным на экране
// остаётся сама лента, а волосяная линия над предложением Telegram уже есть.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { textLinkHitAreaStyle, textLinkLineStyle } from '../components/screenLayout';
import { NOTIFICATION_SETTINGS_PATH } from './notificationPaths';

const LABEL = 'Настройки уведомлений';

// `alignSelf`: в колонке экрана ссылка иначе растягивается на всю ширину, и
// нажатие в пустом месте справа от слов открывало бы настройки.
const linkStyle: CSSProperties = { ...textLinkHitAreaStyle, alignSelf: 'flex-start' };

export function NotificationSettingsLink() {
  return (
    <Link to={NOTIFICATION_SETTINGS_PATH} style={linkStyle}>
      <span style={textLinkLineStyle}>{LABEL}</span>
    </Link>
  );
}
