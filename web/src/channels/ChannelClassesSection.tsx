// «Какие занятия сюда уходят» на странице канала — то же, что секция «Каналы
// рассылки» на странице занятия, но с другой стороны: здесь одно место, где
// видно и меняется, какие занятия кормят канал (отзыв владельца 2026-11-03:
// «чтобы всё легко в одном месте было»). Строка — курс, а не слот расписания:
// тридцать строк «Тайцзицюань пн 19:00»… не читались (отзыв 2026-11-04).
// Блок отдельный от формы канала, как ChannelTestSection: отметка сохраняется
// сразу, кнопка «Сохранить» формы её не касается. Объяснение — до галочек
// (CLAUDE.md «Каждая фича объясняет»).
import type { CSSProperties } from 'react';
import type { ChannelDto } from '@xuanxue/shared';
import { CheckboxListField } from '../components/CheckboxListField';
import { editorSectionStyle } from '../components/editorLayout';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { RichText } from '../components/RichText';
import { SkeletonLines } from '../components/Skeleton';
import { TextLinkButton } from '../components/TextLinkButton';
import { groupClassesByCourse } from './groupClassesByCourse';
import { useChannelClasses } from './useChannelClasses';

const EXPLANATION =
  'Ссылка на занятие и запись **каждого отмеченного курса** уйдут в этот канал. Курс — занятие со всеми его днями недели. Новая Telegram-группа с ботом подключается ко всем занятиям сама.';
const EMPTY_MESSAGE = 'Занятий в расписании пока нет — сначала добавьте их.';

const sectionStyle: CSSProperties = {
  ...editorSectionStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};
const explanationStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};
const bulkStyle: CSSProperties = { display: 'flex', gap: 16, flexWrap: 'wrap' };

export function ChannelClassesSection({ channel }: { channel: ChannelDto }) {
  const { classes, loading, error, reload, pendingIds, saveError, setLinkedMany } =
    useChannelClasses(channel.id);
  const rows = groupClassesByCourse(classes ?? [], channel.id);
  const allLinked = rows.every((row) => row.state === 'all');
  const noneLinked = rows.every((row) => row.state === 'none');
  const busy = pendingIds.size > 0;

  function setAll(linked: boolean) {
    void setLinkedMany(
      rows.flatMap((row) => row.classes.map((cls) => cls.id)),
      linked,
    );
  }

  function onChange(ids: string[]) {
    // Галочку нажимают по одной: изменилась ровно одна строка. Строка
    // «частично» среди отмеченных не числится, поэтому её клик — «отметить всё».
    const selected = new Set(ids);
    const changed = rows.find((row) => selected.has(row.key) !== (row.state === 'all'));
    if (!changed) return;
    void setLinkedMany(
      changed.classes.map((cls) => cls.id),
      selected.has(changed.key),
    );
  }

  return (
    <div style={sectionStyle}>
      <span className="xuanxue-eyebrow">Какие занятия сюда уходят</span>
      <p style={explanationStyle}>
        <RichText text={EXPLANATION} />
      </p>

      {error ? (
        <LoadErrorBanner message={error} onRetry={() => void reload()} />
      ) : loading || !classes ? (
        <SkeletonLines widths={['70%', '60%', '65%']} />
      ) : (
        <>
          {rows.length > 0 && (
            <div style={bulkStyle}>
              {!allLinked && (
                <TextLinkButton disabled={busy} onClick={() => setAll(true)}>
                  Отметить все
                </TextLinkButton>
              )}
              {!noneLinked && (
                <TextLinkButton disabled={busy} onClick={() => setAll(false)}>
                  Снять все
                </TextLinkButton>
              )}
            </div>
          )}
          <CheckboxListField
            legend="Курсы"
            options={rows.map((row) => ({
              id: row.key,
              label: row.name,
              hint: row.days || undefined,
            }))}
            selectedIds={rows.filter((row) => row.state === 'all').map((row) => row.key)}
            mixedIds={rows.filter((row) => row.state === 'some').map((row) => row.key)}
            onChange={onChange}
            disabledIds={rows
              .filter((row) => row.classes.some((cls) => pendingIds.has(cls.id)))
              .map((row) => row.key)}
            emptyMessage={EMPTY_MESSAGE}
            error={saveError ?? undefined}
          />
        </>
      )}
    </div>
  );
}
