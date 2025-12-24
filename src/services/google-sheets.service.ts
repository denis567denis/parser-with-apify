import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';
import { AccountToTrack, VideoMetrics, AccountGlobalMetric } from '../types/video-metrics.interface';

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
   * Ожидается формат: Platform | Account URL | Account Name | Last Checked | Date From | Date To
   */
  async getAccountsToTrack(): Promise<AccountToTrack[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Accounts!A2:F', // Расширили до F для dateFrom и dateTo
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
        dateFrom: row[4] ? new Date(row[4]) : undefined,
        dateTo: row[5] ? new Date(row[5]) : undefined,
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
      // Создаем лист Accounts если его нет (с полями для периода глобальной метрики)
      await this.createSheetIfNotExists('Accounts', [
        ['Platform', 'Account URL', 'Account Name', 'Last Checked', 'Date From', 'Date To'],
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

      // Создаем лист для глобальной метрики аккаунтов
      await this.createSheetIfNotExists('Accounts Global Metric', [
        [
          'Platform',
          'Account URL',
          'Account Name',
          'Date From',
          'Date To',
          'Total Views',
          'Total Likes',
          'Total Comments',
          'Total Shares',
          'Videos Count',
          'Last Updated',
        ],
      ]);

      this.logger.log('Spreadsheet initialized successfully with separate sheets for each platform and global metrics');
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

  /**
   * Агрегирует метрики по аккаунту за указанный период
   */
  async aggregateAccountMetrics(
    account: AccountToTrack,
  ): Promise<AccountGlobalMetric | null> {
    try {
      // Если не указан период, возвращаем null
      if (!account.dateFrom || !account.dateTo) {
        this.logger.warn(`No date range specified for account ${account.accountUrl}`);
        return null;
      }

      // Автоматически исправляем порядок дат, если они перепутаны
      let dateFrom = new Date(account.dateFrom);
      let dateTo = new Date(account.dateTo);
      
      if (dateFrom > dateTo) {
        this.logger.warn(`Date range is reversed for ${account.accountUrl}, swapping: ${dateFrom.toISOString()} <-> ${dateTo.toISOString()}`);
        [dateFrom, dateTo] = [dateTo, dateFrom];
      }

      // Устанавливаем dateFrom на начало дня (00:00:00.000)
      dateFrom.setHours(0, 0, 0, 0);
      
      // Устанавливаем dateTo на конец дня (23:59:59.999)
      dateTo.setHours(23, 59, 59, 999);

      // Определяем имя листа метрик по платформе
      const platformNames: Record<string, string> = {
        'tiktok': 'Metrics TikTok',
        'youtube': 'Metrics YouTube',
        'youtube-shorts': 'Metrics YouTube-Shorts',
        'vk': 'Metrics VK',
        'pinterest': 'Metrics Pinterest',
        'instagram': 'Metrics Instagram',
      };

      const sheetName = platformNames[account.platform];
      if (!sheetName) {
        this.logger.error(`Unknown platform: ${account.platform}`);
        return null;
      }

      // Читаем все метрики этой платформы
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A2:K`, // ID, Account, Video URL, Title, Post Date, Views, Likes, Comments, Shares, Article, Last Updated
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        this.logger.warn(`No metrics found in ${sheetName}`);
        return null;
      }

      // Фильтруем метрики по аккаунту и периоду
      let totalViews = 0;
      let totalLikes = 0;
      let totalComments = 0;
      let totalShares = 0;
      let videosCount = 0;

      this.logger.log(`[${sheetName}] Found ${rows.length} total rows`);
      this.logger.log(`[${sheetName}] Looking for account:`);
      this.logger.log(`  - accountName: "${account.accountName}"`);
      this.logger.log(`  - accountUrl: "${account.accountUrl}"`);
      this.logger.log(`  - platform: "${account.platform}"`);
      this.logger.log(`[${sheetName}] Date range: ${dateFrom.toISOString()} to ${dateTo.toISOString()}`);

      // Показываем первые несколько строк для отладки
      if (rows.length > 0) {
        this.logger.log(`[${sheetName}] First row sample: Account="${rows[0][1]}", PostDate="${rows[0][4]}", Views="${rows[0][5]}"`);
      }

      let matchedCount = 0;
      let skippedByAccount = 0;
      let skippedByDate = 0;
      let checkedRows = 0;

      for (const row of rows) {
        checkedRows++;
        
        // Проверяем что это метрика нашего аккаунта
        const rowAccount = row[1]; // Account в колонке B
        const rowVideoUrl = row[2]; // Video URL в колонке C
        
        if (!rowAccount && !rowVideoUrl) {
          continue;
        }

        // Извлекаем username из URL аккаунта (@username)
        const accountUsername = account.accountUrl?.split('@')[1]?.split('/')[0]?.toLowerCase();
        
        // Извлекаем username из URL видео
        let videoUsername = '';
        if (rowVideoUrl) {
          // Для YouTube: https://www.youtube.com/watch?v=xxx или https://www.youtube.com/shorts/xxx
          // Для TikTok: https://www.tiktok.com/@username/video/xxx
          // Для VK: https://vkvideo.ru/@username/...
          const videoUrlLower = rowVideoUrl.toLowerCase();
          
          if (videoUrlLower.includes('youtube.com')) {
            // Для YouTube нужно смотреть channel ID или @username, но их нет в URL видео
            // Поэтому проверяем по имени канала
            videoUsername = '';
          } else if (videoUrlLower.includes('tiktok.com/@')) {
            videoUsername = rowVideoUrl.split('@')[1]?.split('/')[0]?.toLowerCase();
          } else if (videoUrlLower.includes('vkvideo.ru/@')) {
            videoUsername = rowVideoUrl.split('@')[1]?.split('/')[0]?.toLowerCase();
          }
        }

        // Проверяем совпадения
        const exactNameMatch = rowAccount === account.accountName;
        const exactUrlMatch = rowAccount === account.accountUrl;
        const partialNameMatch = account.accountName && rowAccount.toLowerCase().includes(account.accountName.toLowerCase());
        const reversePartialMatch = account.accountName && account.accountName.toLowerCase().includes(rowAccount.toLowerCase());
        
        // Сравниваем username из URL аккаунта с username из URL видео
        const usernameMatch = accountUsername && videoUsername && accountUsername === videoUsername;
        
        // Сравниваем username из URL аккаунта с именем канала в таблице
        const accountUsernameInName = accountUsername && rowAccount.toLowerCase().includes(accountUsername);
        
        const isMatch = exactNameMatch || exactUrlMatch || partialNameMatch || reversePartialMatch || usernameMatch || accountUsernameInName;

        // Показываем ВСЕ проверки аккаунта для отладки, если ничего не совпало
        if (checkedRows <= 5 || matchedCount === 0) {
          this.logger.log(
            `[${sheetName}] Row ${checkedRows}:\n` +
            `    rowAccount: "${rowAccount}"\n` +
            `    rowVideoUrl: "${rowVideoUrl}"\n` +
            `    accountUsername: "${accountUsername}"\n` +
            `    videoUsername: "${videoUsername}"\n` +
            `  Checks:\n` +
            `    name: exact=${exactNameMatch}, partial=${partialNameMatch}, reverse=${reversePartialMatch}\n` +
            `    url: exact=${exactUrlMatch}, username=${usernameMatch}, usernameInName=${accountUsernameInName}\n` +
            `    → RESULT: ${isMatch ? '✅ MATCH' : '❌ NO MATCH'}`
          );
        }

        if (!isMatch) {
          skippedByAccount++;
          continue;
        }

        // Проверяем дату публикации
        const postDateStr = row[4]; // Post Date в колонке E
        if (!postDateStr) continue;

        const postDate = new Date(postDateStr);
        
        // Детальная проверка даты
        const inRange = postDate >= dateFrom && postDate <= dateTo;
        
        if (matchedCount < 3 || !inRange) {
          // Показываем первые 3 совпадения и все пропуски
          this.logger.debug(
            `[${sheetName}] Video: "${row[3]?.substring(0, 40)}" | ` +
            `PostDate: ${postDateStr} (${postDate.toISOString()}) | ` +
            `InRange: ${inRange} | ` +
            `Checks: ${postDate.toISOString()} >= ${dateFrom.toISOString()} (${postDate >= dateFrom}) && ` +
            `${postDate.toISOString()} <= ${dateTo.toISOString()} (${postDate <= dateTo})`
          );
        }
        
        if (inRange) {
          const views = parseInt(row[5] || '0');
          const likes = parseInt(row[6] || '0');
          const comments = parseInt(row[7] || '0');
          const shares = parseInt(row[8] || '0');
          
          totalViews += views;
          totalLikes += likes;
          totalComments += comments;
          totalShares += shares;
          videosCount++;
          matchedCount++;
          
          if (matchedCount <= 3) {
            this.logger.log(`[${sheetName}] ✅ Video matched #${matchedCount}: ${row[3]?.substring(0, 50)} (${postDateStr}) - Views: ${views}, Likes: ${likes}`);
          }
        } else {
          skippedByDate++;
        }
      }

      this.logger.log(
        `[${sheetName}] 📊 Aggregation summary:\n` +
        `  ✅ Matched: ${videosCount} videos\n` +
        `  ❌ Skipped by account: ${skippedByAccount}\n` +
        `  ❌ Skipped by date: ${skippedByDate}\n` +
        `  📈 Stats: ${totalViews} views, ${totalLikes} likes, ${totalComments} comments, ${totalShares} shares`
      );

      if (videosCount === 0) {
        this.logger.warn(
          `[${sheetName}] ⚠️ No videos found!\n` +
          `  Account: ${account.accountUrl}\n` +
          `  Period: ${dateFrom.toISOString()} to ${dateTo.toISOString()}\n` +
          `  Total rows checked: ${rows.length}\n` +
          `  Skipped by account mismatch: ${skippedByAccount}\n` +
          `  Skipped by date range: ${skippedByDate}`
        );
        return null;
      }

      return {
        platform: account.platform,
        accountUrl: account.accountUrl,
        accountName: account.accountName || 'Unknown',
        dateFrom,
        dateTo,
        totalViews,
        totalLikes,
        totalComments,
        totalShares,
        videosCount,
        lastUpdated: new Date(),
      };
    } catch (error) {
      this.logger.error(`Failed to aggregate metrics for ${account.accountUrl}`, error);
      return null;
    }
  }

  /**
   * Записывает глобальные метрики аккаунта в таблицу
   */
  async writeAccountGlobalMetric(metric: AccountGlobalMetric): Promise<void> {
    try {
      const sheetName = 'Accounts Global Metric';

      // Проверяем существует ли уже запись для этого аккаунта и периода
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A2:K`,
      });

      const rows = response.data.values || [];
      let existingRowIndex = -1;

      // Нормализуем даты для сравнения (только дата без времени)
      const metricDateFrom = new Date(metric.dateFrom);
      metricDateFrom.setHours(0, 0, 0, 0);
      const metricDateTo = new Date(metric.dateTo);
      metricDateTo.setHours(0, 0, 0, 0);

      this.logger.debug(`Looking for existing global metric: platform="${metric.platform}", accountUrl="${metric.accountUrl}"`);
      this.logger.debug(`Date range to match: ${metricDateFrom.toISOString()} to ${metricDateTo.toISOString()}`);

      // Ищем существующую запись
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowPlatform = row[0];
        const rowAccountUrl = row[1];
        const rowDateFromStr = row[3];
        const rowDateToStr = row[4];

        // Нормализуем даты из таблицы
        const rowDateFrom = new Date(rowDateFromStr);
        rowDateFrom.setHours(0, 0, 0, 0);
        const rowDateTo = new Date(rowDateToStr);
        rowDateTo.setHours(0, 0, 0, 0);

        const platformMatch = rowPlatform === metric.platform;
        const urlMatch = rowAccountUrl === metric.accountUrl;
        const dateFromMatch = rowDateFrom.getTime() === metricDateFrom.getTime();
        const dateToMatch = rowDateTo.getTime() === metricDateTo.getTime();

        this.logger.debug(`Row ${i + 2}: platform=${platformMatch}, url=${urlMatch}, dateFrom=${dateFromMatch}, dateTo=${dateToMatch}`);

        if (platformMatch && urlMatch && dateFromMatch && dateToMatch) {
          existingRowIndex = i + 2; // +2 потому что строки начинаются с 2 (1 - заголовки)
          this.logger.log(`Found existing global metric at row ${existingRowIndex}`);
          break;
        }
      }

      // Сохраняем даты в нормализованном формате (только дата, без времени)
      const dateFromNormalized = new Date(metric.dateFrom);
      dateFromNormalized.setHours(0, 0, 0, 0);
      const dateToNormalized = new Date(metric.dateTo);
      dateToNormalized.setHours(0, 0, 0, 0);

      const metricRow = [
        metric.platform,
        metric.accountUrl,
        metric.accountName,
        this.safeToISOString(dateFromNormalized),
        this.safeToISOString(dateToNormalized),
        metric.totalViews,
        metric.totalLikes,
        metric.totalComments,
        metric.totalShares,
        metric.videosCount,
        this.safeToISOString(metric.lastUpdated),
      ];

      this.logger.log(
        `Writing global metric: ${metric.accountName} | ` +
        `Videos: ${metric.videosCount} | Views: ${metric.totalViews} | ` +
        `Likes: ${metric.totalLikes} | Comments: ${metric.totalComments} | ` +
        `Shares: ${metric.totalShares}`
      );

      if (existingRowIndex > 0) {
        // Обновляем существующую запись
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A${existingRowIndex}:K${existingRowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [metricRow],
          },
        });
        this.logger.log(`Updated global metric for ${metric.accountUrl}`);
      } else {
        // Добавляем новую запись
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A:K`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [metricRow],
          },
        });
        this.logger.log(`Added new global metric for ${metric.accountUrl}`);
      }
    } catch (error) {
      this.logger.error(`Failed to write global metric for ${metric.accountUrl}`, error);
      throw error;
    }
  }
}
