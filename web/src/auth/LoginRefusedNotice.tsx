// Вход состоялся, а кабинет не открылся: сервер ответил 403 — у незнакомца
// нет ссылки-приглашения (NO_INVITE_LINK_MESSAGE) или человек заблокирован
// (ACCESS_MESSAGE). Отдельным экраном-тупиком, а не строкой под кнопкой.
//
// Отзыв владельца 2026-09-18: «если человек без ссылки заходит через телегу,
// просто возвращает на страницу логина». Так и было: ADR-0044 перекрасил
// отказ из красного в спокойный серый, и он потерялся между серой подсказкой
// «Откроется Telegram…» и формой почты — при живой кнопке «Войти» человек
// видел ту же страницу входа и не понимал, что вообще произошло. Спокойный
// цвет остаётся (человек ничего не сломал), но отказ теперь занимает место
// самой формы: кнопки и почты под ним нет — обе привели бы к тому же 403.
//
// Тёплая плашка --panel-warm и #55584e — тот же приём и та же причина, что у
// StudentExamCard.tsx: на этой подложке --ink-soft держит только ~4.06:1,
// ниже AA 4.5 (docs/adr/0043).
import type { CSSProperties } from 'react';
import { TextLinkButton } from '../components/TextLinkButton';

// Одна подпись на обе причины отказа: своей ссылки-приглашения нет и доступ
// закрыт — разные тексты, но одинаково «дальше не пускают». Что делать,
// говорит сообщение сервера ниже (docs/VOICE.md: ошибка называет действие).
const TITLE = 'Войти не получилось';
const RETRY_LABEL = 'Войти другим способом';

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '18px 20px',
  borderRadius: 'var(--radius-block)',
  background: 'var(--panel-warm)',
};
const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 22,
  fontWeight: 400,
};
const messageStyle: CSSProperties = { margin: 0, color: '#55584e' };

interface LoginRefusedNoticeProps {
  message: string;
  /** Возврат к форме входа: человек мог войти не тем аккаунтом Telegram, и
   * тупик без выхода заставил бы его перезагружать страницу руками. */
  onRetry: () => void;
}

export function LoginRefusedNotice({ message, onRetry }: LoginRefusedNoticeProps) {
  return (
    <div role="alert" style={panelStyle}>
      <h2 style={titleStyle}>{TITLE}</h2>
      <p style={messageStyle}>{message}</p>
      {/* Текстовая ссылка, не кнопка: главное на экране — объяснение, а
          вторая попытка тем же способом приведёт к тому же отказу
          (docs/adr/0031). */}
      <TextLinkButton onClick={onRetry}>{RETRY_LABEL}</TextLinkButton>
    </div>
  );
}
