# 🔧 Настройка Google Sheets API без credentials.json

## Быстрая инструкция

Все данные из `credentials.json` теперь переносятся в `.env` файл!

### Шаг 1: Получите JSON файл

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте проект → Включите Google Sheets API
3. Создайте Service Account → Скачайте JSON ключ

### Шаг 2: Откройте JSON файл

Вы увидите что-то похожее:

```json
{
  "type": "service_account",
  "project_id": "your-project-12345",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BA...\n-----END PRIVATE KEY-----\n",
  "client_email": "your-service@your-project.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

### Шаг 3: Скопируйте в .env

Из этого JSON вам нужны **только 2 поля**:

```env
# Скопируйте значение из "client_email"
GOOGLE_CLIENT_EMAIL=your-service@your-project.iam.gserviceaccount.com

# Скопируйте значение из "private_key" (целиком, со всеми \n)
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BA...\n-----END PRIVATE KEY-----\n"

# ID вашей таблицы из URL
GOOGLE_SPREADSHEET_ID=1abc_your_spreadsheet_id_xyz
```

### Важные моменты

1. ✅ `GOOGLE_PRIVATE_KEY` должен быть **в кавычках**
2. ✅ Все символы `\n` должны остаться (они обозначают перенос строки)
3. ✅ Скопируйте ключ полностью: от `-----BEGIN` до `-----END`
4. ✅ Не забудьте дать доступ Service Account к таблице (Share → Editor)

### Пример полного .env

```env
# Google Sheets API
GOOGLE_CLIENT_EMAIL=parser-bot@my-project-12345.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...(много символов)...\n-----END PRIVATE KEY-----\n"
GOOGLE_SPREADSHEET_ID=1a2b3c4d5e6f7g8h9i0j

# Apify
APIFY_API_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxx

# Настройки
LIMIT_VIDEO_MAX=200
CHECK_INTERVAL_DAYS=1
PORT=3000
```

---

## Почему это лучше?

### Раньше (с credentials.json):
❌ Нужно хранить отдельный JSON файл  
❌ Риск случайно закоммитить credentials.json  
❌ Сложнее деплоить на сервер  

### Теперь (переменные окружения):
✅ Все в одном `.env` файле  
✅ Стандартный подход (12-factor app)  
✅ Легко деплоить (просто скопировать переменные)  
✅ Удобнее для Docker, Heroku, Vercel и т.д.  

---

## Troubleshooting

### Ошибка: "Google credentials are not configured"

➡️ Проверьте что в `.env` есть **обе** переменные:
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

### Ошибка: "invalid_grant" или "Invalid JWT"

➡️ Проверьте `GOOGLE_PRIVATE_KEY`:
1. Должен быть в кавычках
2. Содержит `\n` (не реальные переносы строк!)
3. Скопирован полностью

### Ошибка: "The caller does not have permission"

➡️ Дайте доступ Service Account к таблице:
1. Откройте Google таблицу
2. Нажмите "Поделиться" (Share)
3. Вставьте email из `GOOGLE_CLIENT_EMAIL`
4. Выберите роль "Редактор" (Editor)

---

**Готово!** Теперь файл `credentials.json` вам не нужен 🎉
