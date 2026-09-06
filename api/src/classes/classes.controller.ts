// CRUD занятий — доступ только учителю/админу (данные школы, ADR-0010).
// Контроллер только валидирует тело/query и зовёт сервис: шифрование секретов,
// PATCH `null` → `$unset`, id субдокументов правил — в ClassesService.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { ClassDto } from '@xuanxue/shared';
import { Roles } from '../auth/auth.decorators';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { ListClassesDto } from './dto/list-classes.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@Controller('classes')
@Roles('teacher', 'admin')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  list(@Query() query: ListClassesDto): Promise<ClassDto[]> {
    return this.classesService.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<ClassDto> {
    return this.classesService.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: CreateClassDto): Promise<ClassDto> {
    return this.classesService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateClassDto): Promise<ClassDto> {
    return this.classesService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.classesService.remove(id);
  }
}
