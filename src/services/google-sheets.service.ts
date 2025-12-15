import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';
import { AccountToTrack, VideoMetrics } from '../types/video-metrics.interface';

@Injectable()
export class GoogleSheetsService implements OnModuleInit {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    try {
      const clientEmail = this.configService.get<string>('google.clientEmail');
      const privateKey = this.configService.get<string>('google.privateKey');
      this.spreadsheetId = this.configService.get<string>('google.spreadsheetId') || '';

      if (!clientEmail || !privateKey) {
        this.logger.error('Google credentials (GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY) are not configured');
        return;
      }

      if (!this.spreadsheetId) {
        this.logger.error('Google Spreadsheet ID is not configured');
        return;
      }

      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheets = google.sheets({ version: 'v4', auth });
      this.logger.log('Google Sheets service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Google Sheets service', error);
    }
  }

  /**
   * Читает аккаунты для отслеживания из Google таблицы
   * Ожидается формат: Platform | Account URL | Account Name | Last Checked
   */
  async getAccountsToTrack(): Promise<AccountToTrack[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Accounts!A2:D', // Начиная со второй строки (первая - заголовки)
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        this.logger.warn('No accounts found in spreadsheet');
        return [];
      }

      return rows.map((row) => ({
        platform: row[0]?.toLowerCase() as 'tiktok' | 'youtube' | 'youtube-shorts' | 'vk' | 'pinterest',
        accountUrl: row[1],
        accountName: row[2] || undefined,
        lastChecked: row[3] ? new Date(row[3]) : undefined,
      }));
    } catch (error) {
      this.logger.error('Failed to read accounts from spreadsheet', error);
      throw error;
    }
  }

  /**
   * Добавляет новый аккаунт для отслеживания
   */
  async addAccountToTrack(account: AccountToTrack): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'Accounts!A:D',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            [
              account.platform,
              account.accountUrl,
              account.accountName || '',
              account.lastChecked ? account.lastChecked.toISOString() : '',
            ],
          ],
        },
      });

      this.logger.log(`Added account: ${account.accountUrl} (${account.platform})`);
    } catch (error) {
      this.logger.error('Failed to add account to spreadsheet', error);
      throw error;
    }
  }

  /**
   * Обновляет время последней проверки аккаунта
   */
  async updateLastChecked(accountUrl: string, date: Date): Promise<void> {
    try {
      // Сначала находим строку с этим аккаунтом
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Accounts!B:B',
      });

      const rows = response.data.values;
      if (!rows) return;

      const rowIndex = rows.findIndex((row) => row[0] === accountUrl);
      if (rowIndex === -1) {
        this.logger.warn(`Account not found: ${accountUrl}`);
        return;
      }

      // Обновляем дату (rowIndex + 1 потому что индексы с 1)
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `Accounts!D${rowIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[date.toISOString()]],
        },
      });
    } catch (error) {
      this.logger.error('Failed to update last checked date', error);
    }
  }

  /**
   * Получает название листа для платформы
   */
  private getSheetNameForPlatform(platform: string): string {
    const platformNames = {
      'tiktok': 'Metrics TikTok',
      'youtube': 'Metrics YouTube',
      'youtube-shorts': 'Metrics YouTube-Shorts',
      'vk': 'Metrics VK',
      'pinterest': 'Metrics Pinterest',
      'instagram': 'Metrics Instagram',
    };
    return platformNames[platform] || 'Metrics';
  }

  /**
   * Безопасное преобразование даты в ISO строку
   */
  private safeToISOString(date: Date | string | number | undefined): string {
    try {
      if (!date) {
        return new Date().toISOString();
      }
      
      if (date instanceof Date) {
        if (isNaN(date.getTime())) {
          return new Date().toISOString();
        }
        return date.toISOString();
      }
      
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return new Date().toISOString();
      }
      
      return parsedDate.toISOString();
    } catch (error) {
      this.logger.warn(`Invalid date value: ${date}, using current date`);
      return new Date().toISOString();
    }
  }

  /**
   * Записывает или обновляет метрики видео в Google таблицу
   * Каждая платформа имеет свой отдельный лист
   */
  async writeVideoMetrics(metrics: VideoMetrics[]): Promise<void> {
    if (metrics.length === 0) return;

    try {
      // Группируем метрики по платформам
      const metricsByPlatform = metrics.reduce((acc, metric) => {
        if (!acc[metric.platform]) {
          acc[metric.platform] = [];
        }
        acc[metric.platform].push(metric);
        return acc;
      }, {} as Record<string, VideoMetrics[]>);

      // Обрабатываем каждую платформу отдельно
      for (const [platform, platformMetrics] of Object.entries(metricsByPlatform)) {
        const sheetName = this.getSheetNameForPlatform(platform);
        
        for (const metric of platformMetrics) {
          await this.upsertVideoMetric(sheetName, metric);
        }
      }

      this.logger.log(`Processed ${metrics.length} video metrics`);
    } catch (error) {
      this.logger.error('Failed to write metrics to spreadsheet', error);
      throw error;
    }
  }

  /**
   * Добавляет или обновляет метрику видео (теперь по ID вместо URL)
   */
  private async upsertVideoMetric(sheetName: string, metric: VideoMetrics): Promise<void> {
    try {
      // Проверяем, существует ли видео по ID
      const existingRow = await this.findVideoRowById(sheetName, metric.id);

      if (existingRow !== null) {
        // ОБНОВЛЯЕМ существующую строку
        const values = [[
          metric.id,
          metric.accountName || metric.accountUrl,
          metric.videoUrl,
          metric.title,
          this.safeToISOString(metric.postDate),
          metric.views,
          metric.likes,
          metric.comments,
          metric.shares,
          metric.article,
          this.safeToISOString(metric.lastUpdated),
        ]];

        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A${existingRow}:K${existingRow}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        });
        this.logger.log(`Updated metric for ID: ${metric.id}`);
      } else {
        // ДОБАВЛЯЕМ новую строку
        const values = [[
          metric.id,
          metric.accountName || metric.accountUrl,
          metric.videoUrl,
          metric.title,
          this.safeToISOString(metric.postDate),
          metric.views,
          metric.likes,
          metric.comments,
          metric.shares,
          metric.article,
          this.safeToISOString(metric.lastUpdated),
        ]];

        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A:K`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        });
        this.logger.log(`Added new metric with ID: ${metric.id}`);
      }
    } catch (error) {
      this.logger.error(`Failed to upsert metric for ${metric.id}`, error);
    }
  }

  /**
   * Находит строку с видео по ID (вместо URL)
   */
  private async findVideoRowById(sheetName: string, id: string): Promise<number | null> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:A`, // Колонка A содержит ID
      });

      const rows = response.data.values;
      if (!rows) return null;

      const rowIndex = rows.findIndex((row) => row[0] === id);
      // +2 потому что: +1 для заголовка, +1 для индексации с 1
      return rowIndex >= 0 ? rowIndex + 2 : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Проверяет, существует ли уже видео в таблице (по ID)
   */
  async videoExists(platform: string, id: string): Promise<boolean> {
    try {
      const sheetName = this.getSheetNameForPlatform(platform);
      const row = await this.findVideoRowById(sheetName, id);
      return row !== null;
    } catch (error) {
      this.logger.error('Failed to check if video exists', error);
      return false;
    }
  }

  /**
   * Инициализирует таблицу с необходимыми листами и заголовками
   */
  async initializeSpreadsheet(): Promise<void> {
    try {
      // Создаем лист Accounts если его нет
      await this.createSheetIfNotExists('Accounts', [
        ['Platform', 'Account URL', 'Account Name', 'Last Checked'],
      ]);

      // Заголовки для метрик (с колонкой ID для проверки дубликатов)
      const metricsHeaders = [
        'ID',
        'Account',
        'Video URL',
        'Title',
        'Post Date',
        'Views',
        'Likes',
        'Comments',
        'Shares',
        'Article',
        'Last Updated',
      ];

      // Создаем отдельные листы для каждой платформы
      await this.createSheetIfNotExists('Metrics TikTok', [metricsHeaders]);
      await this.createSheetIfNotExists('Metrics YouTube', [metricsHeaders]);
      await this.createSheetIfNotExists('Metrics YouTube-Shorts', [metricsHeaders]);
      await this.createSheetIfNotExists('Metrics VK', [metricsHeaders]);
      await this.createSheetIfNotExists('Metrics Pinterest', [metricsHeaders]);
      await this.createSheetIfNotExists('Metrics Instagram', [metricsHeaders]);

      this.logger.log('Spreadsheet initialized successfully with separate sheets for each platform');
    } catch (error) {
      this.logger.error('Failed to initialize spreadsheet', error);
      throw error;
    }
  }

  private async createSheetIfNotExists(
    sheetName: string,
    headers: string[][],
  ): Promise<void> {
    try {
      // Проверяем существование листа
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const sheetExists = spreadsheet.data.sheets?.some(
        (sheet) => sheet.properties?.title === sheetName,
      );

      if (!sheetExists) {
        // Создаем новый лист
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: sheetName,
                  },
                },
              },
            ],
          },
        });
      }

      // Проверяем наличие заголовков
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A1:Z1`,
      });

      if (!response.data.values || response.data.values.length === 0) {
        // Добавляем заголовки
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: headers,
          },
        });
      }
    } catch (error) {
      this.logger.error(`Failed to create sheet ${sheetName}`, error);
      throw error;
    }
  }
}
