// «Выгрузить данные» в строке человека (ADR-0160, RUNBOOK §8.22): школа
// обязана за 30 дней ответить тому, кто спросил, какие данные о нём хранятся.
// Файл собирается в один шаг, но до скачивания диалог говорит, зачем он и
// кому его отдавать: выгрузка несёт контакты и ответы человека целиком, и
// главное правило — отправить её самому человеку, а не в общий чат.
import { useState, type CSSProperties } from 'react';
import { PRIVACY_ACCESS_REPLY_DAYS, formatDaysRu } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { dangerNoteStyle } from '../components/screenLayout';
import { usePersonExport } from './usePersonExport';

const EXPORT_LABEL = 'Выгрузить данные';
const EXPORT_CONFIRM_TITLE = 'Выгрузить данные?';
const EXPORT_CONFIRM_LABEL = 'Скачать файл';
// VOICE.md: конкретика — что в файле, в какой срок отвечать и кому отдать.
const EXPORT_CONFIRM_MESSAGE =
  'В файл попадёт всё, что кабинет хранит об этом человеке: аккаунт, оплаты, ответы на экзамены. ' +
  `Если он спросил, какие данные о нём есть, ответить нужно за **${formatDaysRu(PRIVACY_ACCESS_REPLY_DAYS)}**. ` +
  'Отправьте файл **самому человеку**, не в общий чат.';

const errorStyle: CSSProperties = { ...dangerNoteStyle, flexBasis: '100%', margin: 0 };

export function PersonExportButton({ personId }: { personId: string }) {
  const { pending, error, exportData } = usePersonExport(personId);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        {EXPORT_LABEL}
      </Button>
      {error && (
        <p style={errorStyle} role="alert">
          {error}
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          title={EXPORT_CONFIRM_TITLE}
          message={EXPORT_CONFIRM_MESSAGE}
          confirmLabel={EXPORT_CONFIRM_LABEL}
          confirmVariant="primary"
          pending={pending}
          onConfirm={exportData}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
