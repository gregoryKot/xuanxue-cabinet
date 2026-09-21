// Раздел экрана «Проверка работ» — подзаголовок + список (CLAUDE.md «Одна
// механика — один компонент», по образцу materials/TagSection.tsx): «Ждут
// проверки» и «Проверенные» (GradingQueueScreen.tsx, docs/PLAN.md §4.6) —
// одна и та же обвязка «заголовок + список + честная пустота + ошибка/
// повтор» через общий ListScreenBody, различаются только заголовком,
// данными и пустым сообщением. Вынесено отдельным файлом, чтобы сам экран
// оставался под лимитом CLAUDE.md «Храповики» (150 строк).
import type { ExamAttemptDto } from '@xuanxue/shared';
import type { CSSProperties } from 'react';
import { ListScreenBody } from '../components/ListScreenBody';
import { oneCardListStyle } from '../components/listCardStyles';
import { screenColumnTitleStyle } from '../components/screenLayout';
import { GradingQueueCard } from './GradingQueueCard';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };

interface GradingQueueSectionProps {
  title: string;
  attempts: ExamAttemptDto[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  emptyMessage: string;
  onSelect: (attemptId: string) => void;
}

export function GradingQueueSection({
  title,
  attempts,
  loading,
  error,
  onRetry,
  emptyMessage,
  onSelect,
}: GradingQueueSectionProps) {
  return (
    <section style={sectionStyle}>
      <h2 style={screenColumnTitleStyle}>{title}</h2>
      <ListScreenBody
        items={attempts}
        loading={loading}
        error={error}
        onRetry={onRetry}
        emptyMessage={emptyMessage}
        listStyle={oneCardListStyle}
        renderItem={(attempt, index, items) => (
          <GradingQueueCard
            key={attempt.id}
            attempt={attempt}
            onSelect={() => onSelect(attempt.id)}
            isLast={index === items.length - 1}
          />
        )}
      />
    </section>
  );
}
