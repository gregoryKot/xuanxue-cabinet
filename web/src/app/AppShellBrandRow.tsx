// Верхняя строка содержимого без боковой колонки (AppShell.tsx: на телефоне
// и у ученика на мониторе) — знак школы и название. Вынесена отдельным
// компонентом, чтобы AppShell.tsx не перерос 150 строк (CLAUDE.md
// «Храповики»).
//
// Имя человека здесь было ссылкой на личный экран (ADR-0044) — владелец
// спросил «Зачем вообще имя вверху?» (отзыв 2026-09-18): слово ломало
// название школы на две строки, а сам по себе экран в подписи-имени не
// нуждается. Точка входа на телефоне осталась, но вместо имени — значок
// профиля (ProfileIcon.tsx): «Профиль» (ADR-0045, заменил «Уведомления»)
// собрал имя, переключатели уведомлений, связку Telegram и «Выйти» под
// одной ссылкой, а называет её `aria-label`, не текст в строке. На мониторе
// у ученика (боковой колонки не бывает) эту роль по-прежнему играет подвал
// под содержимым (AppShell.tsx).
//
// Колокольчик (ADR-0065) встал сюда же, слева от значка профиля, а не пятым
// пунктом нижней панели: ADR-0025 (навигация по доменам) закрепляет панель
// ровно за доменами школы, у уведомлений домена нет; и технически
// `gridTemplateColumns: repeat(4, 1fr)` в bottomNavStyles.ts посчитан ровно
// на четыре подписи — пятая сжала бы остальные.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ProfileIcon } from '../components/ProfileIcon';
import { SchoolMark, SCHOOL_NAME } from '../components/SchoolMark';
import { NotificationBell } from '../notifications/NotificationBell';

const PROFILE_PATH = '/profile';
const PROFILE_LABEL = 'Профиль';

// Цель нажатия 44×44 (CLAUDE.md «Доступность») держит сама ссылка — значок
// внутри заметно меньше (20×20, ProfileIcon.tsx), лишнее поле вокруг него не
// видно, это область нажатия, не рамка.
const PROFILE_LINK_SIZE_PX = 44;

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 16px',
};
// На 360px строка несёт знак школы, название и теперь два значка по 44px
// (колокольчик и профиль) — длинное название школы обязано подрезаться
// многоточием внутри строки, а не вылезать за неё (тот же приём и тот же
// довод, что у sideBrandTitleStyle в sideNavStyles.ts, и PR #237 «ничего не
// вылезает за свой контейнер»).
const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 500,
  fontSize: 21,
  color: 'var(--ink)',
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
// Общий отступ от названия школы несёт обёртка — обеим целям нажатия своего
// зазора не нужно: они уже по 44px, видимые значки 20px и так расходятся.
const actionsStyle: CSSProperties = {
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
};
// Не textLinkStyle (screenLayout.ts): подчёркивание — приём текстовой
// ссылки, а тут значок без подписи рядом.
const profileLinkStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: PROFILE_LINK_SIZE_PX,
  minHeight: PROFILE_LINK_SIZE_PX,
  color: 'var(--ink-soft)',
};

interface AppShellBrandRowProps {
  isMobile: boolean;
}

export function AppShellBrandRow({ isMobile }: AppShellBrandRowProps) {
  return (
    <span style={rowStyle}>
      <SchoolMark />
      <span style={titleStyle}>{SCHOOL_NAME}</span>
      {isMobile && (
        <span style={actionsStyle}>
          <NotificationBell />
          <Link to={PROFILE_PATH} aria-label={PROFILE_LABEL} style={profileLinkStyle}>
            <ProfileIcon />
          </Link>
        </span>
      )}
    </span>
  );
}
