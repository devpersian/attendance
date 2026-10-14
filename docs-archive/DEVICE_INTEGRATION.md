# راهنمای اتصال دستگاه‌های حضور و غیاب

## 📡 روش‌های اتصال

### 1. Polling (بررسی دوره‌ای)

سرور به صورت خودکار در فواصل زمانی مشخص به دستگاه‌ها متصل شده و داده‌های جدید را دریافت می‌کند.

**پروتکل‌های پشتیبانی شده:**
- TCP/IP (برای ZKTeco و سایر دستگاه‌های شبکه‌ای)
- HTTP/HTTPS (برای دستگاه‌های دارای REST API)
- ZK Protocol (پروتکل اختصاصی ZKTeco)

**تنظیمات:**
- فاصله همگام‌سازی: قابل تنظیم از 30 ثانیه تا 3600 ثانیه
- وضعیت دستگاه: باید "فعال" باشد

### 2. Webhook (دریافت آنی)

دستگاه‌ها می‌توانند به صورت خودکار داده‌ها را به سرور ارسال کنند.

**نمونه درخواست Webhook:**

```bash
POST http://your-server.com/api/devices/webhook
Content-Type: application/json

{
  "deviceId": "device-1",
  "userId": "1001",
  "timestamp": "2024-01-15T08:30:00Z",
  "eventType": "checkin",
  "verificationMethod": "fingerprint",
  "rawData": {
    "deviceModel": "ZKTeco K40",
    "temperature": 36.5,
    "maskDetected": true
  }
}
```

**پارامترها:**
- `deviceId`: شناسه دستگاه (از جدول Devices)
- `userId`: شناسه کاربر در دستگاه (معمولاً کد پرسنلی)
- `timestamp`: زمان ثبت (فرمت ISO 8601)
- `eventType`: نوع رویداد (`checkin` یا `checkout`)
- `verificationMethod`: روش احراز هویت (`fingerprint`, `face`, `card`, `pin`)
- `rawData`: داده‌های اضافی از دستگاه (اختیاری)

**پاسخ موفق:**
```json
{
  "message": "Attendance log received and processed"
}
```

## 🔧 پیکربندی دستگاه‌های مختلف

### ZKTeco (پروتکل ZK)

**تنظیمات دستگاه:**
1. وارد تنظیمات شبکه شوید
2. آدرس IP و پورت (معمولاً 4370) را تنظیم کنید
3. Server Address را به آدرس سرور خود تنظیم کنید
4. Webhook URL را تنظیم کنید (اختیاری)

**نمونه پیکربندی:**
```
IP Address: 192.168.1.100
Port: 4370
Protocol: ZK
Polling Interval: 60 seconds
```

### Suprema FaceStation (HTTP)

**تنظیمات دستگاه:**
1. وارد تنظیمات شبکه شوید
2. HTTP Server را فعال کنید
3. Webhook URL را تنظیم کنید

**نمونه پیکربندی:**
```
IP Address: 192.168.1.101
Port: 80
Protocol: HTTP
Webhook URL: http://your-server.com/api/devices/webhook
```

### دستگاه‌های MQTT

**تنظیمات:**
1. Broker MQTT را پیکربندی کنید
2. Topic را تنظیم کنید: `attendance/{deviceId}`
3. فرمت پیام JSON باشد

**نمونه پیام MQTT:**
```json
{
  "deviceId": "device-3",
  "userId": "1003",
  "timestamp": "2024-01-15T08:30:00Z",
  "eventType": "checkin",
  "verificationMethod": "card"
}
```

## 📊 نگاشت کاربران

برای ارتباط بین کاربران دستگاه و کارکنان سیستم، از کد پرسنلی استفاده می‌شود.

**مثال:**
- کد پرسنلی کارمند: `1001`
- User ID در دستگاه: `1001`

**نکته:** کد پرسنلی کارمند باید با User ID در دستگاه یکسان باشد.

## 🔍 عیب‌یابی

### دستگاه متصل نمی‌شود
1. بررسی کنید آدرس IP و پورت صحیح است
2. بررسی کنید دستگاه و سرور در یک شبکه هستند
3. بررسی کنید فایروال پورت را مسدود نکرده است
4. لاگ‌های دستگاه را بررسی کنید

### داده‌ها همگام‌سازی نمی‌شوند
1. بررسی کنید وضعیت دستگاه "فعال" است
2. بررسی کنید فاصله همگام‌سازی مناسب است
3. لاگ‌های دستگاه را بررسی کنید
4. همگام‌سازی دستی را امتحان کنید

### Webhook کار نمی‌کند
1. بررسی کنید آدرس Webhook صحیح است
2. بررسی کنید سرور در دسترس است
3. لاگ‌های سرور را بررسی کنید
4. با ابزارهایی مانند Postman تست کنید

## 📝 نمونه کد ارسال Webhook

### Python
```python
import requests
from datetime import datetime

webhook_url = "http://your-server.com/api/devices/webhook"

data = {
    "deviceId": "device-1",
    "userId": "1001",
    "timestamp": datetime.now().isoformat(),
    "eventType": "checkin",
    "verificationMethod": "fingerprint"
}

response = requests.post(webhook_url, json=data)
print(response.json())
```

### JavaScript/Node.js
```javascript
const axios = require('axios');

const webhookUrl = 'http://your-server.com/api/devices/webhook';

const data = {
  deviceId: 'device-1',
  userId: '1001',
  timestamp: new Date().toISOString(),
  eventType: 'checkin',
  verificationMethod: 'fingerprint'
};

axios.post(webhookUrl, data)
  .then(response => console.log(response.data))
  .catch(error => console.error(error));
```

### cURL
```bash
curl -X POST http://your-server.com/api/devices/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "device-1",
    "userId": "1001",
    "timestamp": "2024-01-15T08:30:00Z",
    "eventType": "checkin",
    "verificationMethod": "fingerprint"
  }'
```

## 🔐 امنیت

### توصیه‌های امنیتی:
1. از HTTPS برای Webhook استفاده کنید
2. Authentication Token اضافه کنید
3. IP Whitelist تنظیم کنید
4. Rate Limiting فعال کنید
5. لاگ‌ها را به صورت منظم بررسی کنید

### نمونه Webhook با Authentication:
```json
{
  "deviceId": "device-1",
  "userId": "1001",
  "timestamp": "2024-01-15T08:30:00Z",
  "eventType": "checkin",
  "verificationMethod": "fingerprint",
  "authToken": "your-secret-token"
}
```

## 📞 پشتیبانی

برای اطلاعات بیشتر در مورد اتصال دستگاه‌های خاص، با پشتیبانی تماس بگیرید.
