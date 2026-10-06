// GET /me/board — доска ученика (ADR-0172): объявление учителя, если срок его
// показа не истёк. Данные школы, не ученика: владельца нет, нужна только
// сессия — доступно любой роли, включая ученика и гостя без единой роли.
// Образец — my-payments.controller.ts. «Сегодня» берёт сервер: кабинет пояса
// школы не знает (ADR-0049).
import { Controller, Get } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { MyBoardDto } from '@xuanxue/shared';
import { ApiRoute } from '../common/api-route.decorator';
import { BoardService } from './board.service';

@Controller('me/board')
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  @Get()
  @ApiRoute('GET /me/board')
  get(): Promise<MyBoardDto> {
    return this.boardService.getMine(DateTime.utc());
  }
}
