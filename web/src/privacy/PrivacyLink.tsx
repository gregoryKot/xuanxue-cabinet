// Ссылка на политику конфиденциальности — одна на экран входа и на страницу
// приглашения (CLAUDE.md «Одна механика — один компонент»): статья 11 Закона о
// защите частной жизни требует показать её там, где у человека впервые просят
// данные (ADR-0155). Тише самого входа (noteStyle) — юридическая ссылка, не
// второе действие экрана (docs/adr/0031, «одно очевидное главное действие»);
// линия снизу — та же примета кликабельности, что у остальных текстовых
// ссылок кабинета (textLinkLineStyle, ADR-0098), только некрупная.
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PRIVACY_PATH } from '@xuanxue/shared';
import { noteStyle, textLinkLineStyle } from '../components/screenLayout';

const privacyLinkStyle: CSSProperties = {
  ...noteStyle,
  ...textLinkLineStyle,
  alignSelf: 'flex-start',
  color: 'inherit',
  textDecoration: 'none',
};

export function PrivacyLink({ children }: { children: ReactNode }) {
  return (
    <Link to={PRIVACY_PATH} style={privacyLinkStyle}>
      {children}
    </Link>
  );
}
