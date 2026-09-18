// Вторая, вспомогательная строка карточки ссылки-приглашения — тот же код
// через бота (link.telegramUrl, ADR-0030 «Бот»). Вынесена из
// InviteLinkCard.tsx: карточка перешагнула порог 150 строк храповика
// (CLAUDE.md «Храповики» — «Компонент React больше 150 — выноси хуки и
// подкомпоненты», образец — broadcasts/BroadcastsSectionLinks.tsx).
//
// Свой useCopyText — «Скопировано» здесь не должно переключать кнопку
// строки сайта в InviteLinkCard.tsx и наоборот (независимые состояния одной
// механики, не два разных компонента, CLAUDE.md «Одна механика — один
// компонент»).
import type { CSSProperties } from 'react';
import { TextLinkButton } from '../components/TextLinkButton';
import { useCopyText } from '../broadcasts/useCopyText';

const COPY_LABEL = 'Скопировать';
const COPIED_LABEL = 'Скопировано';

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  paddingTop: 16,
  borderTop: '1px solid var(--line-soft)',
};
const lineStyle: CSSProperties = {
  display: 'flex',
  gap: 14,
  flexWrap: 'wrap',
  alignItems: 'center',
};
// overflow/ellipsis — тот же приём, что и у адреса сайта: на 360px длинный
// deep-link бота обязан обрезаться, а не рвать раскладку строки.
const urlStyle: CSSProperties = {
  flex: '1 1 220px',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 13,
  color: 'var(--ink-soft)',
};
const alertTextStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--danger)' };

export function InviteLinkTelegramRow({ url }: { url: string }) {
  const { copied, error, copy } = useCopyText();
  return (
    <div style={rowStyle}>
      <span className="xuanxue-eyebrow">Для Telegram</span>
      <div style={lineStyle}>
        <span style={urlStyle}>{url}</span>
        <TextLinkButton onClick={() => void copy(url)}>
          {copied ? COPIED_LABEL : COPY_LABEL}
        </TextLinkButton>
      </div>
      {error && (
        <p role="alert" style={alertTextStyle}>
          {error}
        </p>
      )}
    </div>
  );
}
