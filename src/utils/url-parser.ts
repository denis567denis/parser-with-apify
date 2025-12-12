/**
 * Утилиты для парсинга URL социальных сетей
 */

/**
 * Извлекает username из URL TikTok
 * @param url - https://www.tiktok.com/@username или @username
 * @returns username без @
 */
export function parseTikTokUrl(url: string): string | null {
  const match = url.match(/@([a-zA-Z0-9._]+)/);
  return match ? match[1] : null;
}

/**
 * Извлекает username из URL YouTube
 * @param url - https://www.youtube.com/@username
 * @returns username без @
 */
export function parseYouTubeUrl(url: string): string | null {
  const match = url.match(/@([a-zA-Z0-9._-]+)/);
  return match ? match[1] : null;
}

/**
 * Извлекает username из URL VK или VK Video
 * @param url - https://vk.com/username, https://vkvideo.ru/@username, https://vk.com/club12345
 * @returns username без @ или null
 */
export function parseVKUrl(url: string): string | null {
  // Обработка vkvideo.ru/@username
  if (url.includes('vkvideo.ru')) {
    const match = url.match(/@([a-zA-Z0-9._-]+)/);
    return match ? match[1] : null;
  }
  
  // Обработка обычных vk.com ссылок
  const urlParts = url.split('/').filter(p => p);
  const ownerParam = urlParts[urlParts.length - 1];
  
  // Убираем префиксы club и id, возвращаем чистый screen_name
  if (ownerParam.startsWith('club')) {
    return ownerParam.replace('club', '');
  } else if (ownerParam.startsWith('id')) {
    return ownerParam.replace('id', '');
  } else {
    return ownerParam;
  }
}

/**
 * Нормализует URL для единообразного хранения
 */
export function normalizeUrl(platform: string, url: string): string {
  switch (platform) {
    case 'tiktok': {
      const username = parseTikTokUrl(url);
      return username ? `https://www.tiktok.com/@${username}` : url;
    }
    case 'youtube':
    case 'youtube-shorts': {
      const username = parseYouTubeUrl(url);
      return username ? `https://www.youtube.com/@${username}` : url;
    }
    case 'vk': {
      const username = parseVKUrl(url);
      return username ? `https://vk.com/${username}` : url;
    }
    default:
      return url;
  }
}
