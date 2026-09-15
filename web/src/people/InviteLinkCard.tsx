// Ссылка-приглашение школы (ADR-0030) — блок на «Людях», для admin и teacher
// (RequirePeopleAccess, уточнение владельца 2026-09-15) — API того же
// требует (`@Roles('teacher', 'admin')`, users.controller.ts). Объяснение до
// действия (CLAUDE.md «Продукт»): что это и что случится, если её отправить.
// «Скопировать» —
// общий useCopyText (broadcasts/useCopyText.ts, CLAUDE.md «Одна механика —
// один компонент»); «Создать новую» — общий ConfirmDialog, тот же приём, что
// удаление строки на PersonRow.tsx рядом.
import { useState, type CSSProperties } from 'react';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { Skeleton } from '../components/Skeleton';
import { useCopyText } from '../broadcasts/useCopyText';
import { useInviteLink } from './useInviteLink';

const EXPLANATION =
  'Отправьте ссылку ученику или опубликуйте в канале. Кто откроет её и войдёт, сразу попадёт в кабинет без подтверждения.';
const ROTATE_CONFIRM_TITLE = 'Создать новую ссылку?';
const ROTATE_CONFIRM_MESSAGE = 'Прежняя ссылка перестанет работать. Создать новую?';

const cardStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};
const urlRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  alignItems: 'center',
};
const codeStyle: CSSProperties = {
  flex: '1 1 200px',
  minWidth: 0,
  overflowWrap: 'break-word',
  background: 'var(--surface)',
  padding: '8px 10px',
  borderRadius: 8,
  fontSize: 13,
};
const alertTextStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--danger)' };

export function InviteLinkCard() {
  const { link, loading, error, reload, rotating, rotateError, rotate } = useInviteLink();
  const { copied, error: copyError, copy } = useCopyText();
  const [confirmingRotate, setConfirmingRotate] = useState(false);

  async function confirmRotate(): Promise<void> {
    await rotate();
  }

  return (
    <section style={cardStyle}>
      <h2 style={{ fontSize: 16, margin: 0 }}>Ссылка-приглашение</h2>
      <p style={{ margin: 0, color: 'var(--ink-soft)' }}>{EXPLANATION}</p>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {!error && loading && link === null && <Skeleton h={44} radius={8} />}

      {!error && link && link.url === null && (
        <Button
          pending={rotating}
          onClick={() => void rotate()}
          style={{ alignSelf: 'flex-start' }}
        >
          Создать ссылку
        </Button>
      )}

      {!error && link?.url && (
        <>
          <div style={urlRowStyle}>
            <code style={codeStyle}>{link.url}</code>
            <Button variant="secondary" onClick={() => void copy(link.url as string)}>
              {copied ? 'Скопировано' : 'Скопировать'}
            </Button>
            <Button
              variant="danger"
              disabled={rotating}
              onClick={() => setConfirmingRotate(true)}
            >
              Создать новую
            </Button>
          </div>
          {copyError && (
            <p role="alert" style={alertTextStyle}>
              {copyError}
            </p>
          )}
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
