import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GoogleSheetsService } from '../services/google-sheets.service';

@ApiTags('Admin')
@Controller('api/admin')
export class AdminController {
  constructor(private googleSheetsService: GoogleSheetsService) {}

  @Post('initialize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Инициализировать Google таблицу',
    description: 'Создает необходимые листы (Accounts, Metrics) и заголовки в Google таблице',
  })
  @ApiResponse({
    status: 200,
    description: 'Таблица успешно инициализирована',
  })
  async initializeSpreadsheet() {
    await this.googleSheetsService.initializeSpreadsheet();

    return {
      success: true,
      message: 'Spreadsheet initialized successfully',
    };
  }
}
