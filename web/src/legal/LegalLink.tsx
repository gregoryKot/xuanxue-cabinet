// Ссылки на юридические страницы без входа — политика конфиденциальности и
// «Доступность» (CLAUDE.md «Одна механика — один компонент»). Статья 11
// Закона о защите частной жизни требует показать политику там, где у человека
// впервые просят данные (ADR-0155), а правила доступности — держать заявление
// в заметном месте сайта (ADR-0158): экран входа, приглашение, «Профиль» и сами
// страницы друг у друга. Тише самого входа (noteStyle) — юридическая ссылка, не
// второе действие экрана (docs/adr/0031, «одно очевидное главное действие»).
//
// Цель нажатия 44px набирает оболочка (textLinkHitAreaStyle), линию несёт
// внутренний <span> (textLinkLineStyle, ADR-0098): раньше линия стояла на
// самой ссылке высотой в строку 13px — цель нажатия вдвое ниже 44.
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PRIVACY_PATH } from '@xuanxue/shared';
import { ACCESSIBILITY_PATH } from '../accessibility/accessibilityPath';
import { textLinkHitAreaStyle, textLinkLineStyle } from '../components/screenLayout';

const LEGAL_PAGES = {
  privacy: { path: PRIVACY_PATH, label: 'Политика конфиденциальности' },
  accessibility: { path: ACCESSIBILITY_PATH, label: 'Доступность' },
} as const;

type LegalPageKey = keyof typeof LEGAL_PAGES;

// Кегль приписки (noteStyle) — после textLinkHitAreaStyle: тот несёт
// `font: inherit` и сбросил бы размер обратно на 15px тела.
const LEGAL_LINK_FONT_SIZE_PX = 13;

const linkStyle: CSSProperties = {
  ...textLinkHitAreaStyle,
  fontSize: LEGAL_LINK_FONT_SIZE_PX,
  alignSelf: 'flex-start',
};

// Две ссылки рядом не толкают экран вниз: на 360 px обе умещаются в строку,
// на более узком переносятся.
const rowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', columnGap: 20 };

interface LegalLinkProps {
  page: LegalPageKey;
  /** Своя подпись вместо стандартной: на приглашении политика называется
   * «Как мы храним данные» — там человеку впервые предлагают оставить имя. */
  children?: ReactNode;
}

export function LegalLink({ page, children }: LegalLinkProps) {
  const { path, label } = LEGAL_PAGES[page];

  return (
    <Link to={path} style={linkStyle}>
      <span style={textLinkLineStyle}>{children ?? label}</span>
    </Link>
  );
}

/** Обе ссылки строкой — экран входа, приглашение и «Профиль». */
export function LegalLinks({ privacyLabel }: { privacyLabel?: string }) {
  return (
    <div style={rowStyle}>
      <LegalLink page="privacy">{privacyLabel}</LegalLink>
      <LegalLink page="accessibility" />
    </div>
  );
}
