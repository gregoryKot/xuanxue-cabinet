// Строка на главном экране «Расписание» (ADR-0198): у скольких занятий из
// правил недели ссылка дойдёт не до всех групп. Сами предупреждения живут на
// подэкране «Правила недели», а смотрят сюда; без этой строки отказ рассылки
// остался бы тихим. Грузится, сбой каналов или групп, всё в порядке — не
// рисуем ничего: ложное предупреждение хуже пустоты, а сбой покажет сам
// список правил.
import type { CSSProperties } from 'react';
import type { ClassDto } from '@xuanxue/shared';
import { useChannels } from '../channels/useChannels';
import { RichText } from '../components/RichText';
import { screenHintStyle } from '../components/screenLayout';
import { TextLinkButton } from '../components/TextLinkButton';
import { useGroups } from '../groups/useGroups';
import {
  countUndeliveredClasses,
  undeliveredNotice,
} from '../schedule/undeliveredClasses';

const OPEN_RULES_LABEL = 'Открыть правила недели';

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  columnGap: 16,
};
const noticeStyle: CSSProperties = { ...screenHintStyle, color: 'var(--danger)' };

interface RulesDeliveryNoticeProps {
  classes: ClassDto[] | null;
  onOpenRules: () => void;
}

export function RulesDeliveryNotice({ classes, onOpenRules }: RulesDeliveryNoticeProps) {
  const { channels } = useChannels();
  const { groups } = useGroups();
  const text = undeliveredNotice(countUndeliveredClasses(classes, groups, channels));
  if (!text) return null;
  return (
    <div style={rowStyle}>
      <span style={noticeStyle}>
        <RichText text={text} />
      </span>
      <TextLinkButton onClick={onOpenRules}>{OPEN_RULES_LABEL}</TextLinkButton>
    </div>
  );
}
