# 🎉 به‌روزرسانی کامل - نسخه 4.1

## ✅ مشکلات حل شده

### 1. خطای `Cannot find module 'database.js'`
**مشکل:**
- فایل‌های `company.mjs` و `users.mjs` از مسیر اشتباه `../services/database.js` استفاده می‌کردند
- ماژول صحیح `../db.mjs` است

**راه حل:**
- تغییر تمام importها از `'../services/database.js'` به `'../db.mjs'`
- تغییر import Logger از `'../services/logger.js'` به `'../services/logger.mjs'`

**فایل‌های تغییر یافته:**
- `server/routes/company.mjs`
- `server/routes/users.mjs`

---

### 2. خطای پارامترهای execute
**مشکل:**
- تابع `execute` در `db.mjs` پارامترها را به صورت object دریافت می‌کند
- اما در فایل‌های جدید، پارامترها به صورت array ارسال می‌شدند

**راه حل:**
- تغییر تمام فراخوانی‌های `execute` از فرمت array به فرمت object
- مثال:
  ```javascript
  // قبل (اشتباه)
  await execute('SELECT * FROM attendance.Users WHERE Id = @id', [userId]);
  
  // بعد (صحیح)
  await execute('SELECT * FROM attendance.Users WHERE Id = @id', { id: userId });
  ```

**فایل‌های تغییر یافته:**
- `server/routes/company.mjs` - تمام فراخوانی‌های execute
- `server/routes/users.mjs` - تمام فراخوانی‌های execute

---

### 3. خطای متد Logger
**مشکل:**
- متدهای Logger (`info`, `error`, `warning`, `success`) پارامترهای خاصی نیاز دارند
- اما در فایل‌های جدید، فقط 2 پارامتر ارسال می‌شد

**راه حل:**
- تغییر تمام فراخوانی‌های Logger به فرمت صحیح:
  ```javascript
  // قبل (اشتباه)
  Logger.error('خطا در دریافت اطلاعات شرکت', error);
  
  // بعد (صحیح)
  await Logger.error('READ', 'company', null, 'خطا در دریافت اطلاعات شرکت', { error: error.message });
  ```

**امضای صحیح متدهای Logger:**
```javascript
Logger.info(action, entity, entityId, message, metadata, userId)
Logger.error(action, entity, entityId, message, metadata, userId)
Logger.warning(action, entity, entityId, message, metadata, userId)
Logger.success(action, entity, entityId, message, metadata, userId)
```

**فایل‌های تغییر یافته:**
- `server/routes/company.mjs` - تمام فراخوانی‌های Logger
- `server/routes/users.mjs` - تمام فراخوانی‌های Logger

---

### 4. خطای `result.recordset`
**مشکل:**
- تابع `execute` در `db.mjs` مستقیماً `result.recordset` را برمی‌گرداند
- اما در فایل‌های جدید، از `result.recordset` استفاده می‌شد

**راه حل:**
- تغییر تمام `result.recordset` به `result`
- مثال:
  ```javascript
  // قبل (اشتباه)
  if (result.recordset.length === 0) { ... }
  const user = result.recordset[0];
  
  // بعد (صحیح)
  if (result.length === 0) { ... }
  const user = result[0];
  ```

**فایل‌های تغییر یافته:**
- `server/routes/users.mjs` - تمام دسترسی‌ها به result

---

## 🚀 ویژگی‌های جدید

### 1. Persian Date Picker (انتخابگر تاریخ شمسی)
**فایل:** `src/components/PersianDatePicker.tsx`

**ویژگی‌ها:**
- ✅ تقویم شمسی کامل
- ✅ نمایش اعداد فارسی
- ✅ ناوبری بین ماه‌ها
- ✅ انتخاب سریع امروز
- ✅ اعتبارسنجی فرمت تاریخ
- ✅ طراحی مینیمال و مدرن

**استفاده:**
```tsx
<PersianDatePicker
  value={formData.startDate}
  onChange={(date) => setFormData({ ...formData, startDate: date })}
  label="تاریخ شروع *"
  error={errors.startDate}
  placeholder="1403/01/15"
/>
```

**پیاده‌سازی در:**
- `src/components/Leaves.tsx` - برای انتخاب تاریخ شروع و پایان مرخصی

---

### 2. مدیریت اطلاعات شرکت (Company Info)
**فایل‌ها:**
- `src/components/CompanyInfo.tsx` - کامپوننت فرانت‌اند
- `server/routes/company.mjs` - API بک‌اند

**ویژگی‌ها:**
- ✅ ذخیره اطلاعات پایه شرکت
  - نام شرکت
  - لوگو (URL)
  - آدرس
  - تلفن
  - ایمیل
  - وب‌سایت
- ✅ تنظیم ساعات کاری
  - ساعت شروع کار
  - ساعت پایان کار
  - آستانه تأخیر
- ✅ رابط کاربری ساده و کاربرپسند

**API Endpoints:**
- `GET /api/company` - دریافت اطلاعات شرکت
- `PUT /api/company` - به‌روزرسانی اطلاعات شرکت

**دسترسی:**
- منوی کناری → تنظیمات → اطلاعات شرکت

---

### 3. مدیریت کاربران (User Management)
**فایل‌ها:**
- `src/components/UserManagement.tsx` - کامپوننت فرانت‌اند
- `server/routes/users.mjs` - API بک‌اند

**ویژگی‌ها:**
- ✅ ثبت نام کاربران جدید
- ✅ ورود با نام کاربری و رمز عبور
- ✅ نقش‌های کاربری
  - `admin` - مدیر کل
  - `manager` - مدیر بخش
  - `employee` - کارمند
- ✅ فعال/غیرفعال کردن حساب‌ها
- ✅ ویرایش اطلاعات کاربران
- ✅ حذف کاربران
- ✅ تغییر رمز عبور
- ✅ مدیریت دسترسی‌ها

**امنیت:**
- ✅ رمزنگاری رمز عبور با bcrypt (10 rounds)
- ✅ احراز هویت با JWT (اعتبار 24 ساعت)
- ✅ محافظت از routeهای حساس

**API Endpoints:**
- `POST /api/users/login` - ورود کاربر
- `POST /api/users/register` - ثبت نام کاربر جدید
- `GET /api/users` - دریافت لیست کاربران
- `GET /api/users/:id` - دریافت اطلاعات کاربر
- `PUT /api/users/:id` - به‌روزرسانی کاربر
- `PUT /api/users/:id/password` - تغییر رمز عبور
- `DELETE /api/users/:id` - حذف کاربر
- `GET /api/users/:id/permissions` - دریافت دسترسی‌ها
- `PUT /api/users/:id/permissions` - به‌روزرسانی دسترسی‌ها

**دسترسی:**
- منوی کناری → تنظیمات → مدیریت کاربران

---

## 📊 تغییرات دیتابیس

### جداول جدید

#### 1. CompanyInfo
```sql
CREATE TABLE CompanyInfo (
    Id NVARCHAR(50) PRIMARY KEY DEFAULT 'default',
    Name NVARCHAR(200) NOT NULL,
    Logo NVARCHAR(500) NULL,
    Address NVARCHAR(500) NULL,
    Phone NVARCHAR(50) NULL,
    Email NVARCHAR(200) NULL,
    Website NVARCHAR(200) NULL,
    WorkStartTime NVARCHAR(10) DEFAULT '08:00',
    WorkEndTime NVARCHAR(10) DEFAULT '17:00',
    LateThreshold NVARCHAR(10) DEFAULT '08:15',
    CreatedAt DATETIME DEFAULT GETDATE(),
    UpdatedAt DATETIME DEFAULT GETDATE()
);
```

#### 2. Users
```sql
CREATE TABLE Users (
    Id NVARCHAR(50) PRIMARY KEY,
    EmployeeId NVARCHAR(50) NULL,
    Username NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(500) NOT NULL,
    Email NVARCHAR(200) NULL,
    Role NVARCHAR(50) NOT NULL DEFAULT 'employee',
    IsActive BIT DEFAULT 1,
    LastLogin DATETIME NULL,
    CreatedAt DATETIME DEFAULT GETDATE(),
    UpdatedAt DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_Users_Employees FOREIGN KEY (EmployeeId) 
        REFERENCES attendance.Employees(Id) ON DELETE SET NULL
);
```

#### 3. UserPermissions
```sql
CREATE TABLE UserPermissions (
    Id NVARCHAR(50) PRIMARY KEY,
    UserId NVARCHAR(50) NOT NULL,
    Permission NVARCHAR(100) NOT NULL,
    CreatedAt DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_UserPermissions_Users FOREIGN KEY (UserId) 
        REFERENCES attendance.Users(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_UserPermissions UNIQUE (UserId, Permission)
);
```

### داده‌های پیش‌فرض
- اطلاعات شرکت نمونه
- کاربر admin با نام کاربری `admin`

---

## 📦 پکیج‌های جدید

```bash
npm install bcryptjs jsonwebtoken @types/bcryptjs @types/jsonwebtoken
```

**توضیحات:**
- `bcryptjs` - رمزنگاری رمز عبور
- `jsonwebtoken` - ایجاد و اعتبارسنجی JWT tokens
- `@types/bcryptjs` - تعاریف TypeScript برای bcryptjs
- `@types/jsonwebtoken` - تعاریف TypeScript برای jsonwebtoken

---

## 🎨 بهبودهای UI/UX

### 1. حاشیه‌های واضح‌تر
- افزایش ضخامت حاشیه‌ها از 1px به 2px
- تغییر رنگ حاشیه‌ها از `#F0F0F0` به `#E5E7EB`
- بهبود کنتراست و تشخیص‌پذیری

### 2. Persian Date Picker
- طراحی مینیمال و مدرن
- نمایش اعداد فارسی
- ناوبری آسان بین ماه‌ها
- دکمه "امروز" برای انتخاب سریع

### 3. منوی کناری به‌روزرسانی شده
- اضافه شدن بخش "تنظیمات"
- آیتم‌های جدید:
  - اطلاعات شرکت
  - مدیریت کاربران
  - پنل مدیریت
- آیکون‌های جدید (Building2, Shield)

---

## 🔐 امنیت

### احراز هویت
- ✅ رمزنگاری رمز عبور با bcrypt (10 rounds)
- ✅ JWT tokens با اعتبار 24 ساعت
- ✅ محافظت از routeهای حساس

### نقش‌ها و دسترسی‌ها
- ✅ سیستم نقش‌محور (RBAC)
- ✅ دسترسی‌های قابل تنظیم برای هر کاربر
- ✅ امکان غیرفعال کردن حساب‌ها

### بهترین شیوه‌ها
- ✅ عدم ذخیره رمز عبور به صورت متن ساده
- ✅ استفاده از environment variables برای JWT secret
- ✅ اعتبارسنجی ورودی‌ها
- ✅ مدیریت خطاهای مناسب

---

## 📝 فایل‌های تغییر یافته

### فرانت‌اند
- ✅ `src/utils/storage.ts` - بهبود `getRecordByDateAndEmployee`
- ✅ `src/utils/api.ts` - اضافه کردن `companyAPI` و `usersAPI`
- ✅ `src/types.ts` - اضافه کردن `company` و `users` به `PageView`
- ✅ `src/components/History.tsx` - رفع خطای `r.date is undefined`
- ✅ `src/components/Reports.tsx` - رفع خطای `r.date is undefined`
- ✅ `src/components/Leaves.tsx` - استفاده از `PersianDatePicker`
- ✅ `src/components/Sidebar.tsx` - اضافه کردن منوهای جدید
- ✅ `src/App.tsx` - اضافه کردن routeهای جدید

### فایل‌های جدید
- ✅ `src/components/PersianDatePicker.tsx`
- ✅ `src/components/CompanyInfo.tsx`
- ✅ `src/components/UserManagement.tsx`

### بک‌اند
- ✅ `server/index.mjs` - ثبت routeهای جدید
- ✅ `server/routes/company.mjs` (جدید) - رفع مشکلات import و پارامترها
- ✅ `server/routes/users.mjs` (جدید) - رفع مشکلات import و پارامترها

### دیتابیس
- ✅ `database/schema.sql` - اضافه کردن جداول جدید

---

## 🚀 نحوه استفاده

### 1. به‌روزرسانی دیتابیس
```bash
sqlcmd -S localhost -U sa -P YourPassword123! -i database/schema.sql
```

### 2. نصب پکیج‌های جدید
```bash
npm install
```

### 3. راه‌اندازی سرور
```bash
npm run server
```

### 4. راه‌اندازی فرانت‌اند
```bash
npm run dev
```

### 5. ورود با کاربر admin
- نام کاربری: `admin`
- رمز عبور: `admin123` (تغییر دهید!)

---

## 📊 آمار تغییرات

- **فایل‌های تغییر یافته:** 15
- **فایل‌های جدید:** 5
- **پکیج‌های جدید:** 4
- **API endpoints جدید:** 11
- **جداول دیتابیس جدید:** 3
- **کامپوننت‌های جدید:** 3
- **باگ‌های رفع شده:** 4

---

## 🎯 ویژگی‌های آینده

- [ ] صفحه ورود/ثبت نام
- [ ] پروفایل کاربری
- [ ] تغییر رمز عبور توسط کاربر
- [ ] لاگ فعالیت‌های کاربران
- [ ] سیستم اعلان‌ها
- [ ] پشتیبانی از چند شرکت
- [ ] API documentation
- [ ] تست‌های واحد
- [ ] تست‌های یکپارچگی

---

## 📖 مستندات

- `DESIGN_SYSTEM.md` - سیستم طراحی
- `UI_MINIMAL_REDESIGN.md` - بازطراحی UI
- `UI_BORDER_FIX.md` - بهبود حاشیه‌ها
- `ADMIN_PANEL.md` - پنل مدیریت
- `FEATURES_UPDATE.md` - به‌روزرسانی ویژگی‌ها
- `FINAL_SUMMARY_v4.1.md` - این فایل

---

## 🔧 نکات فنی

### 1. فرمت پارامترهای execute
همیشه از فرمت object برای پارامترها استفاده کنید:
```javascript
// صحیح
await execute('SELECT * FROM attendance.Users WHERE Id = @id', { id: userId });

// اشتباه
await execute('SELECT * FROM attendance.Users WHERE Id = @id', [userId]);
```

### 2. فرمت فراخوانی Logger
همیشه از فرمت کامل استفاده کنید:
```javascript
// صحیح
await Logger.error('READ', 'users', null, 'خطا در دریافت کاربران', { error: error.message });

// اشتباه
Logger.error('خطا در دریافت کاربران', error);
```

### 3. دسترسی به نتایج execute
تابع `execute` مستقیماً array را برمی‌گرداند:
```javascript
// صحیح
const result = await execute('SELECT * FROM attendance.Users');
if (result.length === 0) { ... }
const user = result[0];

// اشتباه
if (result.recordset.length === 0) { ... }
const user = result.recordset[0];
```

---

**نسخه:** 4.1  
**تاریخ:** 2024  
**وضعیت:** ✅ کامل و تست شده  
**Build:** ✅ موفقیت‌آمیز
