// Раздел «Группы» экрана «Школа» (ADR-0193, ADR-0195): общий список групп.
// Объяснение стоит до первого действия (CLAUDE.md «Каждая фича объясняет»):
// откуда группы берутся в занятии и что с ними можно сделать. Данные —
// отдельный `GET /groups`, не настройки школы: список не ждёт `/settings`, а
// записи встают на экран из ответа самой записи (ADR-0087, useGroups.ts).
import type { CSSProperties } from 'react';
import { useChannels } from '../channels/useChannels';
import { AddGroupForm } from '../groups/AddGroupForm';
import { useGroups } from '../groups/useGroups';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { oneCardListStyle } from '../components/listCardStyles';
import { RichText } from '../components/RichText';
import { screenExplanationStyle } from '../components/screenLayout';
import { SkeletonLines } from '../components/Skeleton';
import { GroupRow } from './GroupRow';
import { groupsSummaryText } from './groupsText';
import { schoolSectionStyle } from './schoolSectionStyle';

const EXPLANATION =
  'Группы учеников — **начинающие, средние, старшие**. Занятие и канал выбирают по **одной группе**: ссылка и запись идут в каналы той же группы.';

const summaryStyle: CSSProperties = { margin: 0, fontSize: 14, fontWeight: 600 };

export function GroupsSection() {
  const { groups, loading, error, reload, create, rename, remove } = useGroups();
  // Названия каналов — в строке группы: «каналы: Тайцзи вечер» или «канала нет».
  // Сбой списка каналов строку не ломает — остаётся число из самой группы.
  const channelsState = useChannels();
  const channels = channelsState.error ? null : channelsState.channels;

  return (
    <section style={schoolSectionStyle}>
      <h2 className="xuanxue-eyebrow" style={{ margin: 0 }}>
        Группы
      </h2>
      <p style={screenExplanationStyle}>
        <RichText text={EXPLANATION} />
      </p>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}
      {loading && !error && <SkeletonLines widths={['90%', '95%', '70%']} />}

      {groups && (
        <>
          <p style={summaryStyle}>
            <RichText text={groupsSummaryText(groups.length)} />
          </p>
          {groups.length > 0 && (
            <ul style={oneCardListStyle}>
              {groups.map((group, index) => (
                <GroupRow
                  key={group.id}
                  group={group}
                  isLast={index === groups.length - 1}
                  channelTitles={
                    channels === null
                      ? null
                      : channels
                          .filter((channel) => channel.groupId === group.id)
                          .map((channel) => channel.title)
                  }
                  onRename={rename}
                  onRemove={remove}
                />
              ))}
            </ul>
          )}
          <AddGroupForm onAdd={create} />
        </>
      )}
    </section>
  );
}
