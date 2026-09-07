// Лист «Новая рассылка» — оболочка SheetShell (общая с ClassSheet.tsx/
// LessonSheet.tsx/ChannelSheet.tsx).
import type { FormEvent } from 'react';
import type { ChannelDto, CreateBroadcastInput } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { FormServerError } from '../components/FormServerError';
import { SheetShell } from '../components/SheetShell';
import { useDialog } from '../hooks/useDialog';
import { useHistorySheet } from '../hooks/useHistorySheet';
import { BroadcastFormFields } from './BroadcastFormFields';
import { useBroadcastForm } from './useBroadcastForm';

interface BroadcastSheetProps {
  channels: ChannelDto[];
  onClose: () => void;
  onCreate: (input: CreateBroadcastInput) => Promise<void>;
}

export function BroadcastSheet({ channels, onClose, onCreate }: BroadcastSheetProps) {
  const goBack = useHistorySheet(onClose);
  const { headingRef } = useDialog(goBack);
  const form = useBroadcastForm(onCreate);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await form.submit()) goBack();
  }

  return (
    <SheetShell
      titleId="broadcast-sheet-title"
      title="Новая рассылка"
      headingRef={headingRef}
      onSubmit={(e) => void handleSubmit(e)}
      onClose={goBack}
    >
      <BroadcastFormFields
        state={form.state}
        setField={form.setField}
        error={form.validationError}
        channels={channels}
      />

      <FormServerError error={form.serverError} />

      <Button type="submit" pending={form.pending}>
        Отправить
      </Button>
    </SheetShell>
  );
}
