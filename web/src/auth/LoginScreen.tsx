// Экран входа — до первого действия объясняет, что это и зачем (CLAUDE.md
// «Продукт»). Облик — колонка на бумаге (components/EntryColumn.tsx), без
// карточки: вход должен выглядеть страницей сайта школы, а не окном чужого
// приложения (docs/adr/0031). Основной способ входа, на любом устройстве, —
// переход текущей вкладки на Telegram (TelegramLoginSection.tsx, общий с
// JoinScreen.tsx, ADR-0030). Уже вошедшего уводит на сохранённый адрес или
// домашний экран, не показывая эту форму (аудит L2 — раньше жёстко на
// /schedule, мимо экрана, с которого человек пришёл).
import type { CSSProperties } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { EntryColumn } from '../components/EntryColumn';
import {
  noteStyle,
  screenExplanationStyle,
  textLinkLineStyle,
} from '../components/screenLayout';
import { OtherLoginMethods } from './OtherLoginMethods';
import { TelegramLoginSection } from './TelegramLoginSection';
import { hasSession, useAuth } from './AuthProvider';
import { useAuthConfig } from './useAuthConfig';
import { postLoginPath } from './returnTo';

// Тише самого входа (noteStyle) — юридическая ссылка внизу, не второе
// действие экрана (docs/adr/0031, «одно очевидное главное действие»); линия
// снизу — та же примета кликабельности, что у остальных текстовых ссылок
// кабинета (textLinkLineStyle, ADR-0098), только некрупная.
const privacyLinkStyle: CSSProperties = {
  ...noteStyle,
  ...textLinkLineStyle,
  alignSelf: 'flex-start',
  color: 'inherit',
  textDecoration: 'none',
};

// Единственное место, где кабинет вообще упоминает ссылку-приглашение
// (ADR-0030) до входа: и Telegram, и почта всё равно упрутся в неё дальше
// (403 без нового человека в школе).
//
// Отзыв владельца 2026-09-18: `xuanxue.su` — адрес самого кабинета, и всякий,
// кто открыл его без сессии, упирается в форму входа. Незнакомцу форма
// странна, и объяснять ему правила школы целым абзацем незачем — он сюда не
// собирался. Поэтому не вопрос «Первый раз здесь?» в вес объяснения экрана, а
// подпись в одну строку и тише его (noteStyle): свои читают её один раз,
// незнакомец видит, что дверь не для него, и никто не уходит в Telegram зря.
const INVITE_REQUIRED_MESSAGE = 'Первый вход — только по ссылке от учителя.';

export default function LoginScreen() {
  const { status: authStatus } = useAuth();
  const { config, status: configStatus, reload } = useAuthConfig();

  // hasSession, не authStatus === 'ok' (ревью PR #150): заблокированного тоже
  // уводит с формы входа — здесь ему нечего делать, а RequireAuth дальше
  // покажет ACCESS_MESSAGE вместо того, чтобы он тут снова жал «Войти».
  if (hasSession(authStatus)) return <Navigate to={postLoginPath()} replace />;

  return (
    <EntryColumn>
      {/* xuanxue-login-title, не screenTitleStyle: заголовок входа крупнее и
          отзывчивый (34px на телефоне / 40px на мониторе, index.css) — это
          первый экран кабинета, не раздел внутри него (макет 2d). */}
      <h1 className="xuanxue-login-title">Кабинет школы</h1>
      <p style={screenExplanationStyle}>
        Расписание, ссылки на занятия, записи и экзамены. Для учеников и учителей.
      </p>
      <p style={noteStyle}>{INVITE_REQUIRED_MESSAGE}</p>

      <TelegramLoginSection config={config} configStatus={configStatus} onReload={reload}>
        {/* Google и почта — оба за своим флагом конфигурации (ADR-0145,
            ADR-0029): без него кнопка/форма звала бы 503 на каждый вход. */}
        <OtherLoginMethods config={config} configStatus={configStatus} />
      </TelegramLoginSection>

      {/* Обязательное поле консоли Google Cloud для OAuth-приложения не в
          режиме тестирования (ADR-0145) — публичная ссылка на политику
          конфиденциальности, доступная без входа. */}
      <Link to="/privacy" style={privacyLinkStyle}>
        Политика конфиденциальности
      </Link>
    </EntryColumn>
  );
}
