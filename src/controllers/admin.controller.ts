import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GoogleSheetsService } from '../services/google-sheets.service';
import { MetricsCollectorService } from '../services/metrics-collector.service';

@ApiTags('Admin')
@Controller('api/admin')
export class AdminController {
  constructor(
    private googleSheetsService: GoogleSheetsService,
    private metricsCollectorService: MetricsCollectorService,
  ) {}

  @Post('initialize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Инициализировать Google таблицу',
    description: 'Создает необходимые листы (Accounts, Metrics, Accounts Global Metric) и заголовки в Google таблице',
  })
  @ApiResponse({
    status: 200,
    description: 'Таблица успешно инициализирована',
  })
  async initializeSpreadsheet() {
    await this.googleSheetsService.initializeSpreadsheet();

    return {
      success: true,
      message: 'Spreadsheet initialized successfully with Accounts Global Metric sheet',
    };
  }

  @Post('update-global-metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Обновить глобальные метрики всех аккаунтов',
    description: 'Пересчитывает и обновляет глобальные метрики для всех аккаунтов с указанным периодом (Date From - Date To)',
  })
  @ApiResponse({
    status: 200,
    description: 'Глобальные метрики успешно обновлены',
    schema: {
      example: {
        success: true,
        message: 'Global metrics updated successfully',
        processed: 5,
        updated: 3,
      },
    },
  })
  async updateGlobalMetrics() {
    const accounts = await this.googleSheetsService.getAccountsToTrack();
    
    let processed = 0;
    let updated = 0;

    for (const account of accounts) {
      // Пропускаем аккаунты без указанного периода
      if (!account.dateFrom || !account.dateTo) {
        continue;
      }

      processed++;

      try {
        // Агрегируем метрики
        const globalMetric = await this.googleSheetsService.aggregateAccountMetrics(account);

        if (globalMetric) {
          // Записываем в таблицу
          await this.googleSheetsService.writeAccountGlobalMetric(globalMetric);
          updated++;
        }
      } catch (error) {
        // Логируем ошибку, но продолжаем обработку других аккаунтов
        console.error(`Failed to update global metric for ${account.accountUrl}:`, error);
      }
    }

    return {
      success: true,
      message: 'Global metrics updated successfully',
      processed,
      updated,
      skipped: accounts.length - processed,
    };
  }
}
