# 🚀 راهنمای شروع و توقف سرویس‌ها

## 📋 روش‌های سریع

### شروع همزمان سرور و کلاینت
```bash
npm run start
```

### توقف همزمان سرور و کلاینت
```bash
npm run stop
```

---

## 🎯 شروع سرویس‌ها

### روش 1: استفاده از npm script (توصیه می‌شود)

```bash
npm run start
```

**ویژگی‌ها:**
- ✅ هر دو سرویس همزمان اجرا می‌شوند
- ✅ خروجی رنگی برای تشخیص آسان (SERVER آبی، CLIENT سبز)
- ✅ اگر یکی از سرویس‌ها متوقف شود، دیگری هم متوقف می‌شود
- ✅ نام‌گذاری واضح در خروجی

**خروجی نمونه:**
```
[SERVER] 📋 Configuration:
[SERVER]    Server Port: 3001
[SERVER]    Client Port: 3000
[SERVER] 🚀 Server running on port 3001
[CLIENT]   VITE v5.0.0  ready in 500 ms
[CLIENT]   ➜  Local:   http://localhost:3000/
```

### روش 2: اجرای جداگانه در دو ترمینال

**ترمینال 1 - Backend Server:**
```bash
npm run server
```

**ترمینال 2 - Frontend Client:**
```bash
npm run dev
```

---

## 🛑 توقف سرویس‌ها

### روش 1: استفاده از npm script (توصیه می‌شود)

```bash
npm run stop
```

این دستور:
- ✅ Process های روی پورت 3001 (Backend) را پیدا و متوقف می‌کند
- ✅ Process های روی پورت 3000 (Frontend) را پیدا و متوقف می‌کند
- ✅ در تمام پلتفرم‌ها (Windows, Linux, Mac) کار می‌کند

**خروجی نمونه:**
```
🔍 Checking for running processes...

🛑 Killing process 12345 on port 3001...
🛑 Killing process 12346 on port 3000...

✅ All processes stopped successfully!
```

### روش 2: استفاده از اسکریپت‌های اختصاصی

#### در Windows:
```bash
# روش 1: استفاده از npm
npm run stop:windows

# روش 2: اجرای مستقیم
stop.bat
```

#### در Linux/Mac:
```bash
# روش 1: استفاده از npm
npm run stop:unix

# روش 2: اجرای مستقیم
./stop.sh
```

### روش 3: توقف دستی

#### در Windows (Command Prompt):
```cmd
:: پیدا کردن process روی پورت 3001
netstat -ano | findstr :3001

:: کشتن process با PID
taskkill /PID <PID> /F

:: پیدا کردن process روی پورت 3000
netstat -ano | findstr :3000

:: کشتن process با PID
taskkill /PID <PID> /F
```

#### در Linux/Mac:
```bash
# پیدا کردن و کشتن process روی پورت 3001
lsof -ti:3001 | xargs kill -9

# پیدا کردن و کشتن process روی پورت 3000
lsof -ti:3000 | xargs kill -9
```

---

## 🔍 بررسی وضعیت سرویس‌ها

### بررسی پورت‌های در حال استفاده

#### در Windows:
```cmd
:: بررسی پورت 3001
netstat -ano | findstr :3001

:: بررسی پورت 3000
netstat -ano | findstr :3000
```

#### در Linux/Mac:
```bash
# بررسی پورت 3001
lsof -i:3001

# بررسی پورت 3000
lsof -i:3000
```

### بررسی process های Node.js

#### در Windows:
```cmd
tasklist | findstr node
```

#### در Linux/Mac:
```bash
ps aux | grep node
```

---

## ⚙️ تنظیمات پورت

### تغییر پورت‌ها

فایل `.env` را ویرایش کنید:

```env
# پورت سرور backend
SERVER_PORT=3001

# پورت کلاینت frontend
CLIENT_PORT=3000
```

### استفاده از پورت‌های سفارشی

اسکریپت‌های stop به صورت خودکار از متغیرهای محیطی استفاده می‌کنند:

```bash
# در Linux/Mac
export SERVER_PORT=8080
export CLIENT_PORT=8081
npm run stop

# در Windows (Command Prompt)
set SERVER_PORT=8080
set CLIENT_PORT=8081
npm run stop

# در Windows (PowerShell)
$env:SERVER_PORT=8080
$env:CLIENT_PORT=8081
npm run stop
```

---

## 📝 اسکریپت‌های موجود

| فایل | توضیحات | پلتفرم |
|------|---------|--------|
| `npm run start` | شروع همزمان سرور و کلاینت | همه |
| `npm run stop` | توقف همزمان (Node.js script) | همه |
| `npm run stop:windows` | توقف همزمان (Batch file) | Windows |
| `npm run stop:unix` | توقف همزمان (Shell script) | Linux/Mac |
| `scripts/stop.mjs` | اسکریپت Node.js برای توقف | همه |
| `stop.bat` | اسکریپت Batch برای Windows | Windows |
| `stop.sh` | اسکریپت Shell برای Unix | Linux/Mac |

---

## 🐛 عیب‌یابی

### مشکل: پورت در حال استفاده است

**خطا:**
```
Error: listen EADDRINUSE: address already in use :::3001
```

**راه حل:**
```bash
# توقف تمام process های مرتبط
npm run stop

# یا دستی
# Windows:
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Linux/Mac:
lsof -ti:3001 | xargs kill -9
```

### مشکل: npm run stop کار نمی‌کند

**راه حل 1:** از اسکریپت‌های اختصاصی استفاده کنید
```bash
# Windows
stop.bat

# Linux/Mac
./stop.sh
```

**راه حل 2:** تمام process های Node.js را متوقف کنید
```bash
# Windows
taskkill /F /IM node.exe

# Linux/Mac
pkill -f node
```

### مشکل: دسترسی denied برای stop.sh

**راه حل:**
```bash
chmod +x stop.sh
./stop.sh
```

---

## 💡 نکات مفید

### 1. استفاده از PM2 (Production)

برای محیط production، از PM2 استفاده کنید:

```bash
# نصب PM2
npm install -g pm2

# شروع با PM2
pm2 start npm --name "attendance-server" -- run server
pm2 start npm --name "attendance-client" -- run dev

# مشاهده وضعیت
pm2 status

# توقف با PM2
pm2 stop all
pm2 delete all
```

### 2. استفاده از alias (Linux/Mac)

می‌توانید alias هایی در فایل `~/.bashrc` یا `~/.zshrc` تعریف کنید:

```bash
alias att-start='cd /path/to/attendance && npm run start'
alias att-stop='cd /path/to/attendance && npm run stop'
```

---

## 📊 خلاصه دستورات

| عملیات | دستور |
|--------|-------|
| **شروع همزمان** | `npm run start` |
| **توقف همزمان** | `npm run stop` |
| **فقط سرور** | `npm run server` |
| **فقط کلاینت** | `npm run dev` |
| **بررسی وضعیت (Windows)** | `netstat -ano \| findstr :3001` |
| **بررسی وضعیت (Linux/Mac)** | `lsof -i:3001` |

---

**نسخه**: 1.0  
**تاریخ**: 2024  
**وضعیت**: ✅ آماده استفاده
