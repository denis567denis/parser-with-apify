import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApifyClient } from 'apify-client';
import { VideoMetrics } from '../types/video-metrics.interface';
import { findArticle } from '../utils/article-extractor';
import { parseTikTokUrl, parseYouTubeUrl, parseVKUrl } from '../utils/url-parser';
import { generateMetricId } from '../utils/id-generator';

@Injectable()
export class ApifyParserService {
  private readonly logger = new Logger(ApifyParserService.name);
  private client: ApifyClient;
  private videoLimit: number;

  constructor(private configService: ConfigService) {
    const apiToken = this.configService.get<string>('apify.apiToken');
    this.client = new ApifyClient({ token: apiToken });
    this.videoLimit = this.configService.get<number>('limits.videoMax') || 50;
  }

  /**
   * Парсит видео с TikTok аккаунта
   */
  async parseTikTokAccount(accountUrl: string): Promise<VideoMetrics[]> {
    try {
      this.logger.log(`Parsing TikTok account: ${accountUrl}`);

      // Извлекаем username из URL
      const username = parseTikTokUrl(accountUrl);
      if (!username) {
        this.logger.error(`Invalid TikTok URL: ${accountUrl}`);
        return [];
      }

      const normalizedUrl = `https://www.tiktok.com/@${username}`;

      // Используем официальный TikTok Scraper от Apify
      const input = {
        excludePinnedPosts: true,
        profileScrapeSections: ["videos"],
        profileSorting: "latest",
        profiles: [normalizedUrl],
        resultsPerPage: this.videoLimit,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
      };

      const run = await this.client.actor('clockworks/tiktok-scraper').call(input);
      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      const results: VideoMetrics[] = [];
      const now = new Date();

      for (const item of items) {
        const itemData = item as any;
        const article = findArticle(String(itemData.text || ''), String(itemData.text || ''));
        
        // Пропускаем видео без артикула
        if (!article) {
          continue;
        }

        const videoId = String(itemData.id);
        const accountName = String(itemData.authorMeta?.name || 'unknown');
        results.push({
          id: generateMetricId('tiktok', accountName, article),
          platform: 'tiktok' as const,
          accountUrl: normalizedUrl,
          accountName,
          videoUrl: String(itemData.webVideoUrl || `https://www.tiktok.com/@${accountName}/video/${videoId}`),
          videoId,
          title: String(itemData.text || ''),
          postDate: new Date(parseInt(String(itemData.createTime)) * 1000),
          views: parseInt(String(itemData.playCount || 0)),
          likes: parseInt(String(itemData.diggCount || 0)),
          comments: parseInt(String(itemData.commentCount || 0)),
          shares: parseInt(String(itemData.shareCount || 0)),
          article,
          collectedAt: now,
          lastUpdated: now,
        });
      }

      this.logger.log(`Found ${results.length} TikTok videos with articles`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to parse TikTok account: ${accountUrl}`, error);
      return [];
    }
  }

  /**
   * Парсит обычные видео с YouTube канала (БЕЗ Shorts)
   */
  async parseYouTubeChannel(channelUrl: string): Promise<VideoMetrics[]> {
    try {
      this.logger.log(`Parsing YouTube channel (regular videos): ${channelUrl}`);

      // Извлекаем username из URL
      const username = parseYouTubeUrl(channelUrl);
      if (!username) {
        this.logger.error(`Invalid YouTube URL: ${channelUrl}`);
        return [];
      }

      const normalizedUrl = `https://www.youtube.com/@${username}`;

      const input = {
        startUrls: [{
          url: normalizedUrl,
        }],
        maxResults: this.videoLimit,
      };

      const run = await this.client.actor('streamers/youtube-scraper').call(input);
      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      const results: VideoMetrics[] = [];
      const now = new Date();

      for (const item of items) {
        const itemData = item as any;
        
        // Фильтруем только валидные видео с ID
        if (!itemData || !(itemData.id || itemData.videoId) || !itemData.title) {
          continue;
        }

        const videoId = itemData.id || itemData.videoId;
        let videoUrl = itemData.url || `https://www.youtube.com/watch?v=${videoId}`;

        // Если URL содержит undefined, пропускаем
        if (!videoUrl || String(videoUrl).includes('undefined')) {
          continue;
        }

        const article = findArticle(String(itemData.text || itemData.description || ''), String(itemData.title || ''));
        
        // Пропускаем видео без артикула
        if (!article) {
          continue;
        }

        const accountName = itemData.channelName || itemData.channelTitle || itemData.authorName || 'unknown';
        results.push({
          id: generateMetricId('youtube', accountName, article),
          platform: 'youtube' as const,
          accountUrl: normalizedUrl,
          accountName,
          videoUrl: String(videoUrl),
          videoId: String(videoId),
          title: String(itemData.title || ''),
          postDate: new Date(itemData.uploadDate || itemData.date || Date.now()),
          views: parseInt(String(itemData.viewCount || itemData.views || 0)),
          likes: parseInt(String(itemData.likes || 0)),
          comments: parseInt(String(itemData.commentCount || itemData.numberOfComments || 0)),
          shares: 0,
          article,
          collectedAt: now,
          lastUpdated: now,
        });
      }

      this.logger.log(`Found ${results.length} regular YouTube videos with articles`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to parse YouTube channel: ${channelUrl}`, error);
      return [];
    }
  }

  /**
   * Парсит YouTube Shorts с канала
   */
  async parseYouTubeShorts(channelUrl: string): Promise<VideoMetrics[]> {
    try {
      this.logger.log(`Parsing YouTube Shorts: ${channelUrl}`);

      // Извлекаем username из URL
      const username = parseYouTubeUrl(channelUrl);
      if (!username) {
        this.logger.error(`Invalid YouTube URL: ${channelUrl}`);
        return [];
      }

      const normalizedUrl = `https://www.youtube.com/@${username}`;

      const input = {
        channels: [username],
        maxResultsShorts: this.videoLimit,
      };

      const run = await this.client.actor('streamers/youtube-shorts-scraper').call(input);
      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      const results: VideoMetrics[] = [];
      const now = new Date();

      for (const item of items) {
        const itemData = item as any;
        
        // Фильтруем только валидные видео с ID
        if (!itemData || !itemData.id || !itemData.title) {
          continue;
        }

        const videoUrl = itemData.url || `https://www.youtube.com/shorts/${itemData.id}`;

        const article = findArticle(String(itemData.text || ''), String(itemData.title || ''));
        
        // Пропускаем видео без артикула
        if (!article) {
          continue;
        }

        const accountName = itemData.channelName || 'unknown';
        results.push({
          id: generateMetricId('youtube-shorts', accountName, article),
          platform: 'youtube-shorts' as const,
          accountUrl: normalizedUrl,
          accountName,
          videoUrl: String(videoUrl),
          videoId: String(itemData.id),
          title: String(itemData.title || ''),
          postDate: new Date(itemData.date || Date.now()),
          views: parseInt(String(itemData.viewCount || 0)),
          likes: parseInt(String(itemData.likes || 0)),
          comments: parseInt(String(itemData.commentsCount || 0)),
          shares: 0,
          article,
          collectedAt: now,
          lastUpdated: now,
        });
      }

      this.logger.log(`Found ${results.length} YouTube Shorts with articles`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to parse YouTube Shorts: ${channelUrl}`, error);
      return [];
    }
  }

  /**
   * Парсит видео с VK профиля используя Apify актор jupri/vkontakte
   * Поддерживает ссылки: https://vkvideo.ru/@username и https://vk.com/username
   */
  async parseVKAccount(accountUrl: string): Promise<VideoMetrics[]> {
    try {
      this.logger.log(`Parsing VK account: ${accountUrl}`);

      // Извлекаем username из URL
      const screenName = parseVKUrl(accountUrl);
      if (!screenName) {
        this.logger.error(`Cannot extract username from VK URL: ${accountUrl}`);
        return [];
      }

      // Формируем query в формате @username/videos
      const query = `@${screenName}/videos`;
      this.logger.log(`Using VK query: ${query}`);

      // Используем Apify актор jupri/vkontakte
      const input = {
        dev_dataset_clear: false,
        dev_no_strip: false,
        hd: false,
        limit: this.videoLimit,
        query: [query],
        search_mode: 'video',
        sort: 'update',
      };

      const run = await this.client.actor('jupri/vkontakte').call(input);
      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      const results: VideoMetrics[] = [];
      const now = new Date();

      for (const item of items) {
        const itemData = item as any;

        // Проверяем что это видео с необходимыми данными
        if (!itemData.title) {
          continue;
        }

        const article = findArticle(itemData.description || '', itemData.title || '');
        
        // Пропускаем видео без артикула
        if (!article) {
          continue;
        }

        const accountName = screenName;
        const vkVideoId = String(itemData.id || itemData.ov_id || '');
        
        results.push({
          id: generateMetricId('vk', accountName, article),
          platform: 'vk' as const,
          accountUrl: `https://vkvideo.ru/@${screenName}`,
          accountName,
          videoUrl: String(itemData.share_url || itemData.direct_url || itemData.url || `https://vk.com/video${itemData.owner_id}_${vkVideoId}`),
          videoId: vkVideoId,
          title: String(itemData.title || ''),
          postDate: new Date(itemData.date * 1000),
          views: parseInt(String(itemData.views || itemData.local_views || 0)),
          likes: parseInt(String(itemData.likes?.count || 0)),
          comments: parseInt(String(itemData.comments || 0)),
          shares: parseInt(String(itemData.reposts?.count || 0)),
          article,
          collectedAt: now,
          lastUpdated: now,
        });
      }

      this.logger.log(`Found ${results.length} VK videos with articles`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to parse VK account: ${accountUrl}`, error);
      return [];
    }
  }

  /**
   * Парсит пины с Pinterest аккаунта
   */
  async parsePinterestAccount(accountUrl: string): Promise<VideoMetrics[]> {
    try {
      this.logger.log(`Parsing Pinterest account: ${accountUrl}`);

      // Используем Pinterest Scraper от Apify
      const input = {
        startUrls: [accountUrl],
        proxyConfig: {
          useApifyProxy: true,
          apifyProxyGroups: []
        },
        scrapeOnlyProfileData: false,
        maxPinsCnt: this.videoLimit,
      };

      const run = await this.client.actor('danielmilevski9/pinterest-crawler').call(input);
      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      const results: VideoMetrics[] = [];
      const now = new Date();

      for (const item of items) {
        const itemData = item as any;
        
        // Фильтруем только видео
        if (!itemData.videos) {
          continue;
        }

        const foundArticle = findArticle(String(itemData.description || ''), String(itemData.title || ''));
        
        // Пропускаем видео без артикула
        if (!foundArticle) {
          continue;
        }

        const pinterestId = String(itemData.id);
        const accountName = String(itemData.profile || 'unknown');
        results.push({
          id: generateMetricId('pinterest', accountName, foundArticle),
          platform: 'pinterest' as const,
          accountUrl,
          accountName,
          videoUrl: String(itemData.sourceUrl),
          videoId: pinterestId,
          title: String(itemData.title || ''),
          postDate: new Date(itemData.createdAt),
          views: parseInt(String(itemData.aggregatedPinData?.aggregatedStats?.saves || 0)),
          likes: parseInt(String(itemData.reaction_counts?.[1] || 0)),
          comments: 0,
          shares: parseInt(String(itemData.aggregated_pin_data?.saves || 0)),
          article: foundArticle,
          collectedAt: now,
          lastUpdated: now,
        });
      }

      this.logger.log(`Found ${results.length} Pinterest videos with articles`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to parse Pinterest account: ${accountUrl}`, error);
      return [];
    }
  }

  /**
   * Парсит посты с Instagram аккаунта
   */
  async parseInstagramAccount(accountUrl: string): Promise<VideoMetrics[]> {
    try {
      this.logger.log(`Parsing Instagram account: ${accountUrl}`);

      const input = {
        directUrls: [accountUrl],
        resultsLimit: this.videoLimit,
        resultsType: 'posts',
        searchType: 'user',
        addParentData: false,
      };

      const run = await this.client.actor('apify/instagram-scraper').call(input);
      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      const results: VideoMetrics[] = [];
      const now = new Date();

      for (const item of items) {
        const itemData = item as any;
        
        // Проверяем что это видео
        if (!itemData || !itemData.id || itemData.type !== 'Video') {
          continue;
        }

        const article = findArticle(String(itemData.caption || ''), String(itemData.caption || ''));
        
        if (!article) {
          continue;
        }

        const instagramId = String(itemData.id);
        const accountName = String(itemData.ownerUsername || 'unknown');
        results.push({
          id: generateMetricId('instagram', accountName, article),
          platform: 'instagram' as const,
          accountUrl,
          accountName,
          videoUrl: String(itemData.url),
          videoId: instagramId,
          title: String(itemData.caption || '').substring(0, 100), // Первые 100 символов caption
          postDate: new Date(itemData.timestamp || Date.now()),
          views: parseInt(String(itemData.videoViewCount || itemData.videoPlayCount || 0)),
          likes: parseInt(String(itemData.likesCount || 0)),
          comments: parseInt(String(itemData.commentsCount || 0)),
          shares: 0, // Instagram не предоставляет shares
          article,
          collectedAt: now,
          lastUpdated: now,
        });
      }

      this.logger.log(`Found ${results.length} Instagram videos with articles`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to parse Instagram account: ${accountUrl}`, error);
      return [];
    }
  }

  /**
   * Универсальный метод для парсинга любой платформы
   */
  async parseAccount(
    platform: 'tiktok' | 'youtube' | 'youtube-shorts' | 'vk' | 'pinterest' | 'instagram',
    accountUrl: string,
  ): Promise<VideoMetrics[]> {
    switch (platform) {
      case 'tiktok':
        return this.parseTikTokAccount(accountUrl);
      case 'youtube':
        return this.parseYouTubeChannel(accountUrl);
      case 'youtube-shorts':
        return this.parseYouTubeShorts(accountUrl);
      case 'vk':
        return this.parseVKAccount(accountUrl);
      case 'pinterest':
        return this.parsePinterestAccount(accountUrl);
      case 'instagram':
        return this.parseInstagramAccount(accountUrl);
      default:
        this.logger.warn(`Unknown platform: ${platform}`);
        return [];
    }
  }
}
