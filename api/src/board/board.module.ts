// BoardController (/me/board) и BoardService — доска ученика (ADR-0172).
// SettingsModule — объявление и пояс школы живут в настройках.
import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { BoardController } from './board.controller';
import { BoardService } from './board.service';

@Module({
  imports: [SettingsModule],
  controllers: [BoardController],
  providers: [BoardService],
})
export class BoardModule {}
