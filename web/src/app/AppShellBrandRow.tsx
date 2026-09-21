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
// Колокольчик (ADR-0063) встал сюда же, слева от значка профиля, а не ещё
// одним пунктом нижней панели: ADR-0025 (навигация по доменам) закрепляет
// панель ровно за доменами школы, у уведомлений домена нет; и панель уже
// занята пятью доменными разделами (ADR-0055) — шестая подпись на 360 px
// не помещается.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { MeDto } from '@xuanxue/shared';
import { ProfileIcon } from '../components/ProfileIcon';
import { SchoolBrandLink } from '../components/SchoolBrandLink';
import { NotificationBell } from '../notifications/NotificationBell';
import { rootPathFor } from './screenAccess';

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
// многоточием внутри строки, а не вылезать за неё. Начертание и подрезка —
// уже часть SchoolWordmark (components/SchoolMark.tsx), тот же приём и тот
// же довод, что у PR #237 «ничего не вылезает за свой контейнер».
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
  /** Знак и название — ссылка на корень роли (SchoolBrandLink.tsx,
   * rootPathFor из screenAccess.ts): адрес зависит от роли, поэтому строке
   * нужен `me`, а не готовый путь — AppShell.tsx его уже держит. */
  me: MeDto | null;
}

export function AppShellBrandRow({ isMobile, me }: AppShellBrandRowProps) {
  return (
    <span style={rowStyle}>
      <SchoolBrandLink to={rootPathFor(me)} />
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
