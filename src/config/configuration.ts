export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  google: {
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json',
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
  },
  apify: {
    apiToken: process.env.APIFY_API_TOKEN || '',
  },
  vk: {
    accessToken: process.env.VK_ACCESS_TOKEN || '',
  },
  scheduler: {
    checkIntervalDays: parseInt(process.env.CHECK_INTERVAL_DAYS || '3', 10),
  },
  limits: {
    videoMax: parseInt(process.env.LIMIT_VIDEO_MAX || '50', 10),
  },
});
