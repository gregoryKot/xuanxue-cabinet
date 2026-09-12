// Один блок в предпросмотре «глазами ученика» (ТЗ 4.3): заголовок, вопросы по
// порядку. Если стоит перемешивание — честно сказано, что порядок будет
// другим у каждого сдающего (это предпросмотр одного варианта, не гарантия
// именно такого порядка).
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import type { ExamBlockDraft } from './examBlocksInput';
import { ExamPreviewQuestion } from './ExamPreviewQuestion';

const SHUFFLE_NOTE =
  'Порядок вопросов в этом блоке будет другим у каждого сдающего — здесь показан один из вариантов.';

const blockStyle: CSSProperties = {
  marginBottom: 24,
  paddingBottom: 16,
  borderBottom: '1px solid var(--border)',
};
const titleStyle: CSSProperties = { fontSize: 16, fontWeight: 600, margin: '0 0 4px' };
const noteStyle: CSSProperties = {
  margin: '0 0 10px',
  fontSize: 13,
  color: 'var(--ink-soft)',
};

interface ExamPreviewBlockProps {
  block: ExamBlockDraft;
  bankItems: ExamItemDto[];
}

export function ExamPreviewBlock({ block, bankItems }: ExamPreviewBlockProps) {
  return (
    <section style={blockStyle}>
      <h3 style={titleStyle}>
        {block.title || 'Блок без названия'}
        {block.required && ' · обязателен'}
      </h3>
      {block.shuffle && <p style={noteStyle}>{SHUFFLE_NOTE}</p>}
      {block.itemIds.length === 0 && <p style={noteStyle}>В блоке пока нет вопросов.</p>}
      {block.itemIds.map((itemId, index) => (
        <ExamPreviewQuestion
          key={itemId}
          index={index}
          item={bankItems.find((candidate) => candidate.id === itemId)}
        />
      ))}
    </section>
  );
}
