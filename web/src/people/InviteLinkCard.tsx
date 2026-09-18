// Ссылка-приглашение школы (ADR-0030, «Бот») — карточка на «Людях», для admin
// и teacher (RequirePeopleAccess, уточнение владельца 2026-09-15) — API того
// же требует (`@Roles('teacher', 'admin')`, users.controller.ts). Облик — по
// макету 2c-people.html (docs/adr/0043): карточка с тенью вместо волосяной
// линии сверху, «Скопировать» и «Обновить» — заливкой/контуром (Button.tsx),
// не текстовыми ссылками, как было при «тихо и благородно» (ADR-0031).
//
// Способа дать ссылку по-прежнему два — сайт и бот (telegramUrl собирает
// сервер, InviteLinkDto — единственный источник формата, фронт его не
// пересобирает), но макет рисует только один адрес крупно: это сайт, самый
// частый случай («опубликуйте в канале»). Строка Telegram остаётся второй,
// тише набранной строкой снизу — убрать её значило бы забрать у бота
// способ раздать ссылку, которого макет просто не касался.
import { useState, type CSSProperties } from 'react';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { Skeleton } from '../components/Skeleton';
import { useCopyText } from '../broadcasts/useCopyText';
import { InviteLinkTelegramRow } from './InviteLinkTelegramRow';
import { useInviteLink } from './useInviteLink';

const EXPLANATION =
  'Отправьте ссылку ученику или опубликуйте в канале. Кто откроет её и войдёт, сразу попадёт в кабинет.';
const CREATE_LABEL = 'Создать ссылку';
const COPY_LABEL = 'Скопировать';
const COPIED_LABEL = 'Скопировано';
const UPDATE_LABEL = 'Обновить';
const ROTATE_CONFIRM_TITLE = 'Обновить ссылку?';
const ROTATE_CONFIRM_MESSAGE = 'Прежняя ссылка перестанет работать. Обновить?';

const INFO_COLUMN_MIN_WIDTH_PX = 220;

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 20,
  background: 'var(--card)',
  boxShadow: 'var(--shadow-card)',
  // Макет рисует здесь радиус 16, а не 14 — берём готовый var(--radius-block):
  // разница 2px на карточке с отступом 20 не видна, а третий токен радиуса
  // ради одной карточки усложнил бы палитру (docs/adr/0043).
  borderRadius: 'var(--radius-block)',
};
const mainRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 20,
  // 360px: кнопки уходят под текст целиком, а не сжимают адрес в ничто.
  flexWrap: 'wrap',
};
const infoColumnStyle: CSSProperties = {
  flex: `1 1 ${INFO_COLUMN_MIN_WIDTH_PX}px`,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const headingStyle: CSSProperties = { margin: 0 };
// overflow/ellipsis — ссылка длинная (32 hex-символа кода) и на 360px обязана
// обрезаться, а не рвать раскладку строки.
const addressStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  color: 'var(--ink)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const captionStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };
const buttonsRowStyle: CSSProperties = { display: 'flex', gap: 10, flexShrink: 0 };
const alertTextStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--danger)' };

export function InviteLinkCard() {
  const { link, loading, error, reload, rotating, rotateError, rotate } = useInviteLink();
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const siteCopy = useCopyText();

  async function confirmRotate(): Promise<void> {
    await rotate();
  }

  return (
    <section style={cardStyle}>
      <div style={mainRowStyle}>
        <div style={infoColumnStyle}>
          {/* Рубрика видна и во время сбоя загрузки — раздел не теряет
              подпись из-за ошибки (CLAUDE.md «Каждая фича объясняет откуда
              это и зачем»), в исходной версии карточки было так же. */}
          <h2 className="xuanxue-eyebrow" style={headingStyle}>
            Ссылка-приглашение
          </h2>
          {!error && link?.url && <p style={addressStyle}>{link.url}</p>}
          {!error && link && <p style={captionStyle}>{EXPLANATION}</p>}
        </div>

        {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

        {!error && loading && link === null && <Skeleton w={140} h={44} radius={8} />}

        {!error && link && link.url === null && (
          <Button pending={rotating} onClick={() => void rotate()}>
            {CREATE_LABEL}
          </Button>
        )}

        {!error && link?.url && (
          <div style={buttonsRowStyle}>
            <Button onClick={() => void siteCopy.copy(link.url ?? '')}>
              {siteCopy.copied ? COPIED_LABEL : COPY_LABEL}
            </Button>
            <Button
              variant="secondary"
              pending={rotating}
              onClick={() => setConfirmingRotate(true)}
            >
              {UPDATE_LABEL}
            </Button>
          </div>
        )}
      </div>

      {siteCopy.error && (
        <p role="alert" style={alertTextStyle}>
          {siteCopy.error}
        </p>
      )}
      {!error && link?.telegramUrl && <InviteLinkTelegramRow url={link.telegramUrl} />}
      {rotateError && (
        <p role="alert" style={alertTextStyle}>
          {rotateError}
        </p>
      )}

      {confirmingRotate && (
        <ConfirmDialog
          title={ROTATE_CONFIRM_TITLE}
          message={ROTATE_CONFIRM_MESSAGE}
          confirmLabel={UPDATE_LABEL}
          pending={rotating}
          onConfirm={confirmRotate}
          onCancel={() => setConfirmingRotate(false)}
        />
      )}
    </section>
  );
}
