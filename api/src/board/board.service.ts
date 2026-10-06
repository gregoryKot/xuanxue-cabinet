// Доска ученика: пока одно объявление учителя со сроком показа (ADR-0172).
// Хранится в настройках школы, поэтому своей коллекции у домена нет — только
// чтение через SettingsService. Срок — дата в поясе школы, включительно:
// «сегодня» считаем в `settings.tz`, а не в UTC и не в поясе процесса, иначе
// объявление «до 20 октября» в Израиле исчезло бы на два часа позже (или
// раньше), чем ждёт учитель.
import { Injectable } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { isBoardNoticeActive, type MyBoardDto } from '@xuanxue/shared';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class BoardService {
  constructor(private readonly settingsService: SettingsService) {}

  async getMine(now: DateTime): Promise<MyBoardDto> {
    const settings = await this.settingsService.get();
    const todayKey = now.setZone(settings.tz).toISODate();
    // toISODate() у валидного DateTime не null; null — только при невалидном
    // поясе, и тогда честнее не показывать ничего, чем показать устаревшее.
    if (!todayKey) return { notice: null };
    const { boardNotice } = settings;
    return { notice: isBoardNoticeActive(boardNotice, todayKey) ? boardNotice : null };
  }
}
