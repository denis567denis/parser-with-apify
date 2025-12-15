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
});
