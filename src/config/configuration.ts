export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  google: {
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL || '',
    privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
  },
  apify: {
    apiToken: process.env.APIFY_API_TOKEN || '',
  },
  scheduler: {
    checkIntervalDays: parseInt(process.env.CHECK_INTERVAL_DAYS || '3', 10),
  },
  limits: {
    videoMax: parseInt(process.env.LIMIT_VIDEO_MAX || '50', 10),
  },
  globalMetrics: {
    // Поддержка форматов:
    // - Абсолютные даты: "2024-01-01" (YYYY-MM-DD)
    // - Относительные даты: "7d", "30d", "90d" (количество дней назад)
    dateFrom: process.env.GLOBAL_METRICS_DATE_FROM || '30d',
    dateTo: process.env.GLOBAL_METRICS_DATE_TO || '0d',
  },
});
