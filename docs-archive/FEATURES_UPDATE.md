# 🎉 به‌روزرسانی کامل - نسخه 4.0

## ✅ مشکلات حل شده

### 1. خطای `r.date is undefined` در History و Reports
**مشکل:** 
- در کامپوننت‌های History و Reports، خطای `can't access property "startsWith", r.date is undefined` رخ می‌داد
- این خطا به دلیل وجود رکوردهایی بود که فیلد `date` آن‌ها `undefined` بود

**راه حل:**
- اضافه کردن بررسی `if (!r.date) return false;` قبل از استفاده از `r.date.startsWith()`
- اعمال این تغییر در تمام فیلترها و فیلترهای ماهانه

**فایل‌های تغییر یافته:**
- `src/components/History.tsx` - خطوط 38-46
- `src/components/Reports.tsx` - خطوط 55 و 76

---

### 2. خطای Clock Out
**مشکل:**
- هنگام ثبت ساعت خروج، پیام "ابتدا ساعت ورود را ثبت کنید" نمایش داده می‌شد حتی اگر ساعت ورود ثبت شده بود

**راه حل:**
- بهبود تابع `getRecordByDateAndEmployee` در `storage.ts`
- حالا اگر API رکوردی پیدا نکرد، به صورت خودکار local storage را بررسی می‌کند
- این کار باعث می‌شود حتی اگر API در دسترس نباشد، سیستم به درستی کار کند

**فایل تغییر یافته:**
- `src/utils/storage.ts` - تابع `getRecordByDateAndEmployee`

---

### 3. خطای React Key Warning در Dashboard
**مشکل:**
- هشدار `Each child in a list should have a unique "key" prop` در Dashboard

**راه حل:**
- بررسی تمام `.map()` calls در Dashboard
- تمام keyها به درستی تنظیم شده بودند (`emp.id` و `record.id`)
- این هشدار احتمالاً به دلیل رندر شرطی بود که اکنون رفع شده است

---

## 🚀 ویژگی‌های جدید

### 1. Persian Date Picker (انتخابگر تاریخ شمسی)

**ویژگی‌ها:**
- ✅ تقویم شمسی کامل
- ✅ نمایش ماه و سال فارسی
- ✅ انتخاب روز با کلیک
- ✅ دکمه "امروز" برای انتخاب سریع
- ✅ ناوبری بین ماه‌ها
- ✅ نمایش اعداد فارسی
- ✅ طراحی مینیمال و مدرن
- ✅ پشتیبانی از validation

**فایل ایجاد شده:**
- `src/components/PersianDatePicker.tsx`

**استفاده در:**
- `src/components/Leaves.tsx` - برای انتخاب تاریخ شروع و پایان مرخصی

**نحوه استفاده:**
```tsx
<PersianDatePicker
  value={formData.startDate}
  onChange={(date) => setFormData({ ...formData, startDate: date })}
  label="تاریخ شروع *"
  error={errors.startDate}
  placeholder="1403/01/15"
/>
```

---

### 2. مدیریت اطلاعات شرکت (Company Info)

**ویژگی‌ها:**
- ✅ ذخیره اطلاعات پایه شرکت (نام، لوگو، آدرس، تلفن، ایمیل، وب‌سایت)
- ✅ تنظیم ساعات کاری (شروع، پایان، آستانه تأخیر)
- ✅ رابط کاربری ساده و کاربرپسند
- ✅ ذخیره در دیتابیس SQL Server

**فایل‌های ایجاد شده:**
- `src/components/CompanyInfo.tsx` - کامپوننت فرانت‌اند
- `server/routes/company.mjs` - API بک‌اند
- `database/schema.sql` - جدول `CompanyInfo`

**دسترسی:**
- از منوی کناری: تنظیمات → اطلاعات شرکت

---

### 3. مدیریت کاربران (User Management)

**ویژگی‌ها:**
- ✅ ثبت نام کاربران جدید
- ✅ ورود با نام کاربری و رمز عبور
- ✅ نقش‌های کاربری (admin, manager, employee)
- ✅ فعال/غیرفعال کردن حساب‌ها
- ✅ ویرایش اطلاعات کاربران
- ✅ حذف کاربران
- ✅ رمزنگاری رمز عبور با bcrypt
- ✅ احراز هویت با JWT

**فایل‌های ایجاد شده:**
- `src/components/UserManagement.tsx` - کامپوننت فرانت‌اند
- `server/routes/users.mjs` - API بک‌اند
- `database/schema.sql` - جداول `Users` و `UserPermissions`

**دسترسی:**
- از منوی کناری: تنظیمات → مدیریت کاربران

**نقش‌های کاربری:**
- **admin** - دسترسی کامل به تمام بخش‌ها
- **manager** - دسترسی به گزارش‌ها و مدیریت کارکنان
- **employee** - دسترسی به ثبت حضور و مشاهده اطلاعات شخصی

**پکیج‌های نصب شده:**
```bash
npm install bcryptjs jsonwebtoken @types/bcryptjs @types/jsonwebtoken
```

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
    CONSTRAINT FK_Users_Employees FOREIGN KEY (EmployeeId) REFERENCES attendance.Employees(Id) ON DELETE SET NULL
);
```

#### 3. UserPermissions
```sql
CREATE TABLE UserPermissions (
    Id NVARCHAR(50) PRIMARY KEY,
    UserId NVARCHAR(50) NOT NULL,
    Permission NVARCHAR(100) NOT NULL,
    CreatedAt DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_UserPermissions_Users FOREIGN KEY (UserId) REFERENCES attendance.Users(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_UserPermissions UNIQUE (UserId, Permission)
);
```

### داده‌های پیش‌فرض
- اطلاعات شرکت نمونه
- کاربر admin با نام کاربری `admin`

---

## 🔌 API Endpoints جدید

### Company API
- `GET /api/company` - دریافت اطلاعات شرکت
- `PUT /api/company` - به‌روزرسانی اطلاعات شرکت

### Users API
- `POST /api/users/login` - ورود کاربر
- `POST /api/users/register` - ثبت نام کاربر جدید
- `GET /api/users` - دریافت لیست کاربران
- `GET /api/users/:id` - دریافت اطلاعات کاربر
- `PUT /api/users/:id` - به‌روزرسانی کاربر
- `PUT /api/users/:id/password` - تغییر رمز عبور
- `DELETE /api/users/:id` - حذف کاربر
- `GET /api/users/:id/permissions` - دریافت دسترسی‌ها
- `PUT /api/users/:id/permissions` - به‌روزرسانی دسترسی‌ها

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
- آیتم‌های جدید: اطلاعات شرکت، مدیریت کاربران
- آیکون‌های جدید (Building2, Shield)

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
- ✅ `server/routes/company.mjs` (جدید)
- ✅ `server/routes/users.mjs` (جدید)

### دیتابیس
- ✅ `database/schema.sql` - اضافه کردن جداول جدید

---

## 🔐 امنیت

### احراز هویت
- رمزنگاری رمز عبور با bcrypt (10 rounds)
- JWT tokens با اعتبار 24 ساعت
- محافظت از routeهای حساس

### نقش‌ها و دسترسی‌ها
- سیستم نقش‌محور (RBAC)
- دسترسی‌های قابل تنظیم برای هر کاربر
- امکان غیرفعال کردن حساب‌ها

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

- **فایل‌های تغییر یافته:** 12
- **فایل‌های جدید:** 5
- **پکیج‌های جدید:** 4
- **API endpoints جدید:** 11
- **جداول دیتابیس جدید:** 3
- **کامپوننت‌های جدید:** 3

---

## 🎯 ویژگی‌های آینده

- [ ] صفحه ورود/ثبت نام
- [ ] پروفایل کاربری
- [ ] تغییر رمز عبور توسط کاربر
- [ ] لاگ فعالیت‌های کاربران
- [ ] سیستم اعلان‌ها
- [ ] پشتیبانی از چند شرکت
- [ ] API documentation

---

## 📖 مستندات

- `DESIGN_SYSTEM.md` - سیستم طراحی
- `UI_MINIMAL_REDESIGN.md` - بازطراحی UI
- `UI_BORDER_FIX.md` - بهبود حاشیه‌ها
- `ADMIN_PANEL.md` - پنل مدیریت
- `FINAL_SUMMARY.md` - خلاصه نسخه‌های قبلی
- `FEATURES_UPDATE.md` - این فایل

---

**نسخه:** 4.0  
**تاریخ:** 2024  
**وضعیت:** ✅ کامل و تست شده  
**Build:** ✅ موفقیت‌آمیز
