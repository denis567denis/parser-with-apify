export interface VideoMetrics {
  id: string; // Уникальный ID для проверки дубликатов
  platform: 'tiktok' | 'youtube' | 'youtube-shorts' | 'vk' | 'pinterest' | 'instagram';
  accountUrl: string;
  accountName?: string;
  videoUrl: string;
  videoId: string;
  title: string;
  postDate: Date;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  article: string; // Обязательное поле (без артикула видео не добавляется)
  collectedAt: Date;
  lastUpdated: Date; // Дата последнего обновления метрик
}

export interface AccountToTrack {
  platform: 'tiktok' | 'youtube' | 'youtube-shorts' | 'vk' | 'pinterest' | 'instagram';
  accountUrl: string;
  accountName?: string;
  lastChecked?: Date;
  dateFrom?: Date; // Начальная дата для расчета глобальной метрики
  dateTo?: Date;   // Конечная дата для расчета глобальной метрики
}

export interface AccountGlobalMetric {
  platform: 'tiktok' | 'youtube' | 'youtube-shorts' | 'vk' | 'pinterest' | 'instagram';
  accountUrl: string;
  accountName: string;
  dateFrom: Date;   // Период расчета (начало)
  dateTo: Date;     // Период расчета (конец)
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  videosCount: number; // Количество видео в периоде
  lastUpdated: Date;
}
