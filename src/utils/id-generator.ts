/**
 * Генерирует уникальный ID для метрики видео
 * Формат: platform-xxx-article
 * где xxx - первые 3 буквы ника, article - артикулы через дефис
 * 
 * @param platform - платформа (youtube, tiktok, и т.д.)
 * @param accountName - имя аккаунта/ника
 * @param article - артикулы (может быть "WB123, 456789" -> преобразуется в "WB123-456789")
 */
export function generateMetricId(platform: string, accountName: string, article: string): string {
  // Получаем первые 3 буквы ника (только буквы и цифры)
  const cleanAccountName = accountName.replace(/[^a-zA-Z0-9]/g, '');
  const firstThree = cleanAccountName.substring(0, 3).toUpperCase() || 'XXX';
  
  // Преобразуем артикулы: убираем пробелы, запятые заменяем на дефисы
  const cleanArticle = article
    .replace(/,\s*/g, '-')  // "WB123, 456" -> "WB123-456"
    .replace(/\s+/g, '-')   // Пробелы в дефисы
    .replace(/[^a-zA-Z0-9-]/g, ''); // Убираем все кроме букв, цифр и дефисов
  
  return `${platform}-${firstThree}-${cleanArticle}`;
}

/**
 * Генерирует случайное число (для обратной совместимости)
 */
export function generateRandomId(): string {
  return String(Math.floor(Math.random() * 10000000000));
}
