// «Какие занятия сюда уходят» на странице канала — то же, что секция «Каналы
// рассылки» на странице занятия, но с другой стороны: здесь одно место, где
// видно и меняется, какие занятия кормят канал (отзыв владельца 2026-11-03:
// «чтобы всё легко в одном месте было»). Блок отдельный от формы канала, как
// ChannelTestSection: галочка сохраняется сразу, кнопка «Сохранить» формы её
// не касается. Объяснение — до галочек (CLAUDE.md «Каждая фича объясняет»).
import type { CSSProperties } from 'react';
import type { ChannelDto } from '@xuanxue/shared';
import { CheckboxListField } from '../components/CheckboxListField';
import { editorSectionStyle } from '../components/editorLayout';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { RichText } from '../components/RichText';
import { SkeletonLines } from '../components/Skeleton';
import { formatClassOptionLabel } from './channelClassesText';
import { useChannelClasses } from './useChannelClasses';

const EXPLANATION =
  'Ссылка на занятие и запись **каждого отмеченного занятия** уйдут в этот канал. Новая Telegram-группа с ботом подключается ко всем занятиям сама. Теги канала выше сужают выбор ещё сильнее.';
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

export function ChannelClassesSection({ channel }: { channel: ChannelDto }) {
  const { classes, loading, error, reload, pendingId, saveError, setLinked } =
    useChannelClasses(channel.id);

  function onChange(ids: string[]) {
    // Галочку нажимают по одной: изменилась ровно одна строка.
    const selected = new Set(ids);
    const changed = (classes ?? []).find(
      (cls) => selected.has(cls.id) !== cls.channelIds.includes(channel.id),
    );
    if (changed) void setLinked(changed.id, selected.has(changed.id));
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
        <CheckboxListField
          legend="Занятия"
          options={classes.map((cls) => ({
            id: cls.id,
            label: formatClassOptionLabel(cls),
          }))}
          selectedIds={classes
            .filter((cls) => cls.channelIds.includes(channel.id))
            .map((cls) => cls.id)}
          onChange={onChange}
          disabledIds={pendingId ? [pendingId] : undefined}
          emptyMessage={EMPTY_MESSAGE}
          error={saveError ?? undefined}
        />
      )}
    </div>
  );
}
