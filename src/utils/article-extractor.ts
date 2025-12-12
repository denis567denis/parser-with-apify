/**
 * Извлекает ВСЕ артикулы из текста (описания или заголовка)
 * Ищет различные форматы артикулов:
 * - ART-12345, WW200631
 * - Артикул: WB123456
 * - #12345
 * - Буквенно-цифровые коды (WW200631, WB123456)
 * Возвращает все найденные артикулы через запятую
 */
export function extractArticle(text: string): string | undefined {
  if (!text) return undefined;

  // Удаляем лишние пробелы и переводы строк
  const cleanText = text.replace(/\s+/g, ' ').trim();

  const foundArticles = new Set<string>();

  const patterns = [
    // Артикаль: 1231231321, Артикул: WB123456, Арт. 213123123
    /(?:артикаль|артикул|арт\.?|код|article|art|sku)[:\s]+([A-Z0-9]+)/gi,
    
    // ART-12345, SKU-12345, WB-12345, WWW-12345 (с дефисом)
    /\b((?:ART|SKU|WB|WW|WWW|WEWE|Артикул|АРТИКУЛ)-[A-Z0-9]+)\b/gi,
    
    // Буквенно-цифровые коды (WW200631, WB123456, WWW1231231, WEWE1231231)
    /\b([A-Z]{2,4}[0-9]{4,})\b/g,
    
    // Просто код в скобках (WB12345, 12345)
    /\(([A-Z0-9]{4,})\)/gi,
    
    // Просто числовой артикул (123123123) - минимум 6 цифр подряд
    /\b([0-9]{6,})\b/g,
  ];

  // Ищем по всем паттернам
  for (const pattern of patterns) {
    const matches = cleanText.matchAll(pattern);
    for (const match of matches) {
      if (match && match[1]) {
        foundArticles.add(match[1].trim().toUpperCase());
      }
    }
  }

  // Хештеги с артикулами (#12312312) - только если содержат цифры
  const hashtagPattern = /#([A-Z0-9]{4,})/gi;
  const hashtagMatches = cleanText.matchAll(hashtagPattern);
  for (const match of hashtagMatches) {
    if (match && match[1]) {
      const value = match[1].trim().toUpperCase();
      // Проверяем, что есть хотя бы одна цифра
      if (/\d/.test(value)) {
        foundArticles.add(value);
      }
    }
  }

  // Если ничего не найдено, пробуем найти код в начале строки
  if (foundArticles.size === 0) {
    const startMatch = cleanText.match(/^([A-Z0-9]{4,})\s/i);
    if (startMatch && startMatch[1]) {
      foundArticles.add(startMatch[1].trim().toUpperCase());
    }
  }

  // Возвращаем все артикулы через запятую
  return foundArticles.size > 0 ? Array.from(foundArticles).join(', ') : undefined;
}

/**
 * Пытается извлечь артикул сначала из описания, затем из заголовка
 */
export function findArticle(description: string, title: string): string | undefined {
  const articleFromDescription = extractArticle(description);
  if (articleFromDescription) {
    return articleFromDescription;
  }

  const articleFromTitle = extractArticle(title);
  if (articleFromTitle) {
    return articleFromTitle;
  }

  return undefined;
}
