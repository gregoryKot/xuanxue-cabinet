// Действие «Отправить скриншот» под строкой месяца (ADR-0050): бот первым,
// кабинет запасным. Оба пути тихие — заливки терракотой нет: скриншот
// необязателен, школа отмечает оплату сама, когда видит перевод (ADR-0049,
// CLAUDE.md «Ноль нагрузки на ученика»).
import type { CSSProperties } from 'react';
import {
  PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS,
  PAYMENT_SCREENSHOT_TTL_UNCONFIRMED_DAYS,
  pluralRu,
  type AuthConfigDto,
  type MeDto,
} from '@xuanxue/shared';
import { FilePickerButton } from '../components/FilePickerButton';
import { RichText } from '../components/RichText';
import {
  dangerNoteStyle,
  noteStyle,
  textLinkHitAreaStyle,
  textLinkLineStyle,
} from '../components/screenLayout';
import { paymentScreenshotRoute } from './paymentScreenshotRoute';

const ACTION_LABEL = 'Отправить скриншот';
const IMAGE_ACCEPT = 'image/*';

/** «30 дней» — срок из общей константы shared, чтобы обещание ученику
 * менялось вместе со сроком, который держит уборщик на сервере. */
function daysText(days: number): string {
  return `${days} ${pluralRu(days, { one: 'день', few: 'дня', many: 'дней', other: 'дня' })}`;
}

const AFTER_CONFIRM = daysText(PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS);
const UNCONFIRMED = daysText(PAYMENT_SCREENSHOT_TTL_UNCONFIRMED_DAYS);

// Один срок на оба пути: file_id из бота уборщик снимает по тем же двум датам,
// что и байты загрузки (payment-screenshot-sweep.service.ts).
const RETENTION_NOTE =
  `Снимок храним **${AFTER_CONFIRM}** после подтверждения ` +
  `и **${UNCONFIRMED}**, если подтверждения не было.`;
const BOT_NOTE =
  'Откроется чат с ботом — пришлите туда фото перевода. ' +
  `${RETENTION_NOTE} ` +
  'Сообщение с фото останется в вашем чате Telegram: удалить его можете только вы.';

const actionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };

interface MyPaymentScreenshotActionProps {
  me: Pick<MeDto, 'telegramLinked'>;
  telegramBotUsername: AuthConfigDto['telegramBotUsername'];
  month: string;
  uploading: boolean;
  uploadError: string | null;
  onFile: (month: string, file: File) => void;
}

export function MyPaymentScreenshotAction({
  me,
  telegramBotUsername,
  month,
  uploading,
  uploadError,
  onFile,
}: MyPaymentScreenshotActionProps) {
  const route = paymentScreenshotRoute(me, telegramBotUsername, month);

  return (
    <div style={actionStyle}>
      {route.kind === 'bot' ? (
        <a
          href={route.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...textLinkHitAreaStyle, alignSelf: 'flex-start' }}
        >
          <span style={textLinkLineStyle}>{ACTION_LABEL}</span>
        </a>
      ) : (
        <FilePickerButton
          label={ACTION_LABEL}
          accept={IMAGE_ACCEPT}
          pending={uploading}
          onFile={(file) => onFile(month, file)}
        />
      )}
      <p style={noteStyle}>
        <RichText text={route.kind === 'bot' ? BOT_NOTE : RETENTION_NOTE} />
      </p>
      {uploadError && (
        <p role="alert" style={dangerNoteStyle}>
          {uploadError}
        </p>
      )}
    </div>
  );
}
