// Инструкция «Как выложить видео, чтобы учитель его открыл» — раскрывающийся
// блок у самой формы ссылки, а не в спрятанном «О разделе» (CLAUDE.md
// «Каждая фича объясняет откуда это и зачем»): туда не заходит тот, кто ещё
// не знает, что у него проблема (ADR-0084 «Альтернативы»). Нужна она потому,
// что выложить запись так, чтобы её открыл чужой человек, — отдельное
// умение: приватное видео на YouTube учитель увидит закрытым и сам об этом
// не напишет, пока не откроет ссылку (ADR-0084 «Контекст»). Ссылка — основной
// путь ответа на видео-вопрос (ADR-0084, уточняет ADR-0023), поэтому
// инструкция стоит рядом с формой ссылки, не с кнопкой бота.
import { useState, type CSSProperties } from 'react';
import { RichText } from '../components/RichText';
import { TextLinkButton } from '../components/TextLinkButton';

const TOGGLE = 'Как выложить видео, чтобы учитель его открыл';
const YOUTUBE =
  'YouTube. В настройках доступа выберите **«Доступ по ссылке»** — «Ограниченный ' +
  'доступ» учитель не откроет. Ссылку возьмите в «Поделиться».';
const VK =
  'ВКонтакте. Загрузите видео в «Мои видео», в приватности поставьте ' +
  '**«Доступ по ссылке» или «Все пользователи»**, скопируйте ссылку.';
const OTHER =
  'Rutube, Яндекс.Диск, Облако Mail.ru годятся так же: видео открывается по ' +
  'ссылке, **без входа в чужой аккаунт**.';
const MISTAKE = 'Проверьте ссылку в окне, где вы не вошли в свой аккаунт.';

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

const mistakeStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };

export function AttemptVideoHowTo() {
  const [open, setOpen] = useState(false);

  return (
    <div style={containerStyle}>
      <TextLinkButton onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {TOGGLE}
      </TextLinkButton>
      {/* Анимации нет вовсе: блок появляется и пропадает сразу, глушить под
          prefers-reduced-motion (CLAUDE.md «Доступность») нечего. */}
      {open && (
        <div style={containerStyle}>
          <ul style={listStyle}>
            <li>
              <RichText text={YOUTUBE} />
            </li>
            <li>
              <RichText text={VK} />
            </li>
            <li>
              <RichText text={OTHER} />
            </li>
          </ul>
          <p style={mistakeStyle}>{MISTAKE}</p>
        </div>
      )}
    </div>
  );
}
