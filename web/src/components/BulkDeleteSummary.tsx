// Итог массового удаления (ADR-0141) — вынесен из BulkDeleteBar.tsx, чтобы
// тот не пробил свой предел строк (CLAUDE.md «Храповики»): показывается и
// в режиме выбора, и после выхода из него (BulkDeleteBar сам решает, когда).
// Список причин отказа — `dividedListStyle` (components/listCardStyles.ts):
// строки без своей поверхности, ритм держит волосяная линия у строки, не
// зазор контейнера (check-card-list-gap.mjs).
import type { BulkDeleteResult, PluralForms } from '@xuanxue/shared';
import { distinctFailureMessages, formatBulkDeleteSummary } from '../lib/bulkDeleteText';
import { dividedListStyle } from './listCardStyles';
import { RichText } from './RichText';

interface BulkDeleteSummaryProps {
  /** `null` — запроса ещё не было, показывать нечего. */
  result: BulkDeleteResult | null;
  forms: PluralForms;
}

export function BulkDeleteSummary({ result, forms }: BulkDeleteSummaryProps) {
  if (!result) return null;
  const failureMessages = distinctFailureMessages(result);

  return (
    <div role="status">
      <p style={{ margin: 0 }}>
        <RichText text={formatBulkDeleteSummary(result, forms)} />
      </p>
      {failureMessages.length > 0 && (
        <ul style={{ ...dividedListStyle, marginTop: 6 }}>
          {failureMessages.map((message) => (
            <li
              key={message}
              style={{
                padding: '4px 0',
                borderTop: '1px solid var(--panel)',
                color: 'var(--danger)',
                fontSize: 14,
              }}
            >
              <RichText text={message} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
