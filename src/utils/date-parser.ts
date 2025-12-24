/**
 * Парсит дату из строки
 * Поддерживает форматы:
 * - Абсолютные даты: "2024-01-01" (YYYY-MM-DD)
 * - Относительные даты: "7d", "30d", "90d" (количество дней назад от сегодня)
 */
export function parseDate(dateString: string): Date | null {
  if (!dateString || dateString.trim() === '') {
    return null;
  }

  const trimmed = dateString.trim();

  // Относительные даты (например, "7d", "30d")
  const relativeMatch = trimmed.match(/^(\d+)d$/i);
  if (relativeMatch) {
    const daysAgo = parseInt(relativeMatch[1], 10);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(0, 0, 0, 0); // Начало дня
    return date;
  }

  // Абсолютные даты (YYYY-MM-DD)
  const absoluteMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (absoluteMatch) {
    const year = parseInt(absoluteMatch[1], 10);
    const month = parseInt(absoluteMatch[2], 10) - 1; // Месяцы с 0
    const day = parseInt(absoluteMatch[3], 10);
    const date = new Date(year, month, day);
    
    // Проверяем валидность
    if (
      date.getFullYear() === year &&
      date.getMonth() === month &&
      date.getDate() === day
    ) {
      return date;
    }
  }

  return null;
}

/**
 * Форматирует дату в строку YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
