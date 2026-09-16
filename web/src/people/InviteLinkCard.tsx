// Ссылка-приглашение школы (ADR-0030, «Бот») — секция на «Людях», для admin и
// teacher (RequirePeopleAccess, уточнение владельца 2026-09-15) — API того
// же требует (`@Roles('teacher', 'admin')`, users.controller.ts). Объяснение
// до действия (CLAUDE.md «Продукт»): что это и что случится, если её
// отправить. Два способа дать одну и ту же ссылку — сайт и бот — строка на
// каждый (CopyRow ниже), формат telegramUrl собирает сервер (InviteLinkDto),
// фронт его не пересобирает (единственный источник формата). «Скопировать» —
// общий useCopyText (broadcasts/useCopyText.ts, CLAUDE.md «Одна механика —
// один компонент»); «Создать новую» — общий ConfirmDialog, тот же приём, что
// удаление строки на PersonRow.tsx рядом.
//
// Облик — ADR-0031: рубрика растяжкой-заглавными вместо рамки-карточки, оба
// действия текстом, без киновари: ссылку заводят один раз и потом к ней не
// возвращаются, а акцентной кнопки на «Людях» после ADR-0034 нет вовсе.
import { useState, type CSSProperties } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { Skeleton } from '../components/Skeleton';
import { TextLinkButton } from '../components/TextLinkButton';
import { useCopyText } from '../broadcasts/useCopyText';
import { useInviteLink } from './useInviteLink';

const EXPLANATION =
  'Отправьте ссылку ученику или опубликуйте в канале. Кто откроет её и войдёт, сразу попадёт в кабинет.';
const ROTATE_CONFIRM_TITLE = 'Создать новую ссылку?';
const ROTATE_CONFIRM_MESSAGE = 'Прежняя ссылка перестанет работать. Создать новую?';

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  paddingTop: 20,
  borderTop: '1px solid var(--line)',
};
const headingStyle: CSSProperties = { margin: 0, fontWeight: 400 };
const explanationStyle: CSSProperties = { margin: 0, color: 'var(--ink-soft)' };
const rowStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle: CSSProperties = { fontSize: 12, color: 'var(--ink-soft)' };
const urlRowStyle: CSSProperties = {
  display: 'flex',
  gap: 14,
  flexWrap: 'wrap',
  alignItems: 'center',
};
// Адрес — моноширинным на подложке: так видно, где ссылка кончается, и
// длинный код не сливается с текстом вокруг.
const codeStyle: CSSProperties = {
  flex: '1 1 220px',
  minWidth: 0,
  overflowWrap: 'break-word',
  background: 'var(--panel)',
  padding: '8px 10px',
  borderRadius: 3,
  fontSize: 13,
};
const alertTextStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--danger)' };

/** Одна строка «адрес + Скопировать» — сайт и бот отличаются только подписью
 * и значением, своя `useCopyText()` на строку (независимый «Скопировано» на
 * каждой). */
function CopyRow({ label, url }: { label: string; url: string }) {
  const { copied, error, copy } = useCopyText();
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <div style={urlRowStyle}>
        <code style={codeStyle}>{url}</code>
        <TextLinkButton onClick={() => void copy(url)}>
          {copied ? 'Скопировано' : 'Скопировать'}
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

export function InviteLinkCard() {
  const { link, loading, error, reload, rotating, rotateError, rotate } = useInviteLink();
  const [confirmingRotate, setConfirmingRotate] = useState(false);

  async function confirmRotate(): Promise<void> {
    await rotate();
  }

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={headingStyle}>
        Ссылка-приглашение
      </h2>
      <p style={explanationStyle}>{EXPLANATION}</p>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {!error && loading && link === null && <Skeleton h={44} radius={3} />}

      {!error && link && link.url === null && (
        <TextLinkButton disabled={rotating} onClick={() => void rotate()}>
          Создать ссылку
        </TextLinkButton>
      )}

      {!error && link?.url && (
        <>
          <CopyRow label="Для сайта" url={link.url} />
          {link.telegramUrl && <CopyRow label="Для Telegram" url={link.telegramUrl} />}
          <TextLinkButton disabled={rotating} onClick={() => setConfirmingRotate(true)}>
            Создать новую
          </TextLinkButton>
        </>
      )}

      {rotateError && (
        <p role="alert" style={alertTextStyle}>
          {rotateError}
        </p>
      )}

      {confirmingRotate && (
        <ConfirmDialog
          title={ROTATE_CONFIRM_TITLE}
          message={ROTATE_CONFIRM_MESSAGE}
          confirmLabel="Создать новую"
          pending={rotating}
          onConfirm={confirmRotate}
          onCancel={() => setConfirmingRotate(false)}
        />
      )}
    </section>
  );
}
