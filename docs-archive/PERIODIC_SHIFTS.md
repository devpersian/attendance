# 🔄 سیستم الگوهای شیفت چرخشی - نسخه 10.0

## 📋 معرفی ویژگی

سیستم الگوهای شیفت چرخشی (Periodic Shift Patterns) امکان تعریف الگوهای پیچیده شیفت کاری با دوره‌های کاری و استراحت متناوب را فراهم می‌کند.

### مثال‌های کاربردی:
- **24 ساعت کار / 36 ساعت استراحت** (چرخه 60 ساعته)
- **12 ساعت کار / 24 ساعت استراحت** (چرخه 36 ساعته)
- **8 ساعت کار / 8 ساعت استراحت / 8 ساعت کار / 8 ساعت استراحت** (چرخه 32 ساعته)
- **الگوهای دلخواه با هر ترکیبی از دوره‌های کاری و استراحت**

---

## 🗄️ ساختار دیتابیس

### جدول ShiftPatterns
الگوهای شیفت چرخشی را ذخیره می‌کند.

```sql
CREATE TABLE ShiftPatterns (
    Id NVARCHAR(50) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    TotalCycleHours INT NOT NULL,  -- مدت کل یک چرخه کامل
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME DEFAULT GETDATE(),
    UpdatedAt DATETIME DEFAULT GETDATE()
);
```

### جدول ShiftPatternPeriods
دوره‌های هر الگو را ذخیره می‌کند.

```sql
CREATE TABLE ShiftPatternPeriods (
    Id NVARCHAR(50) PRIMARY KEY,
    PatternId NVARCHAR(50) NOT NULL,
    PeriodOrder INT NOT NULL,        -- ترتیب دوره در الگو
    PeriodType NVARCHAR(20) NOT NULL, -- 'work', 'rest', 'break'
    DurationHours INT NOT NULL,      -- مدت دوره به ساعت
    ShiftId NVARCHAR(50),            -- شیفت مرتبط (برای دوره‌های کاری)
    Description NVARCHAR(200),
    CreatedAt DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (PatternId) REFERENCES attendance.ShiftPatterns(Id) ON DELETE CASCADE,
    FOREIGN KEY (ShiftId) REFERENCES attendance.Shifts(Id) ON DELETE SET NULL
);
```

### تغییر در جدول EmployeeShifts
اضافه شدن فیلدهای PatternId و PatternStartDate برای پشتیبانی از الگوهای چرخشی.

```sql
ALTER TABLE EmployeeShifts ADD PatternId NVARCHAR(50) NULL;
ALTER TABLE EmployeeShifts ADD PatternStartDate DATETIME NULL;
```

---

## 🔌 API Endpoints

### Shift Patterns API

#### GET /api/shift-patterns
دریافت تمام الگوهای شیفت چرخشی

**Response:**
```json
[
  {
    "Id": "pattern-24-36",
    "Name": "24 ساعت کار / 36 ساعت استراحت",
    "Description": "الگوی شیفت چرخشی 24 ساعت کار و 36 ساعت استراحت",
    "TotalCycleHours": 60,
    "IsActive": true,
    "PeriodCount": 2
  }
]
```

#### GET /api/shift-patterns/:id
دریافت جزئیات یک الگو شامل تمام دوره‌ها

**Response:**
```json
{
  "Id": "pattern-24-36",
  "Name": "24 ساعت کار / 36 ساعت استراحت",
  "Description": "الگوی شیفت چرخشی 24 ساعت کار و 36 ساعت استراحت",
  "TotalCycleHours": 60,
  "IsActive": true,
  "periods": [
    {
      "Id": "period-24-36-1",
      "PatternId": "pattern-24-36",
      "PeriodOrder": 1,
      "PeriodType": "work",
      "DurationHours": 24,
      "ShiftId": "shift-morning",
      "ShiftName": "شیفت صبح",
      "Description": "دوره کاری 24 ساعته"
    },
    {
      "Id": "period-24-36-2",
      "PatternId": "pattern-24-36",
      "PeriodOrder": 2,
      "PeriodType": "rest",
      "DurationHours": 36,
      "ShiftId": null,
      "ShiftName": null,
      "Description": "دوره استراحت 36 ساعته"
    }
  ]
}
```

#### POST /api/shift-patterns
ایجاد الگوی جدید

**Request Body:**
```json
{
  "id": "pattern-custom",
  "name": "الگوی سفارشی",
  "description": "توضیحات الگو",
  "totalCycleHours": 48,
  "periods": [
    {
      "periodOrder": 1,
      "periodType": "work",
      "durationHours": 16,
      "shiftId": "shift-morning",
      "description": "دوره کاری"
    },
    {
      "periodOrder": 2,
      "periodType": "rest",
      "durationHours": 8,
      "description": "استراحت کوتاه"
    },
    {
      "periodOrder": 3,
      "periodType": "work",
      "durationHours": 16,
      "shiftId": "shift-evening",
      "description": "دوره کاری"
    },
    {
      "periodOrder": 4,
      "periodType": "rest",
      "durationHours": 8,
      "description": "استراحت کوتاه"
    }
  ]
}
```

#### PUT /api/shift-patterns/:id
به‌روزرسانی الگو

#### DELETE /api/shift-patterns/:id
حذف الگو (فقط در صورتی که به کارکنان تخصیص داده نشده باشد)

#### GET /api/shift-patterns/:id/calculate
محاسبه دوره فعلی برای یک کارمند

**Query Parameters:**
- `startDate`: تاریخ شروع الگو (ISO format)
- `currentDate`: تاریخ فعلی (ISO format)

**Response:**
```json
{
  "pattern": {
    "Id": "pattern-24-36",
    "Name": "24 ساعت کار / 36 ساعت استراحت",
    "TotalCycleHours": 60
  },
  "currentPeriod": {
    "Id": "period-24-36-1",
    "PeriodOrder": 1,
    "PeriodType": "work",
    "DurationHours": 24,
    "ShiftId": "shift-morning",
    "ShiftName": "شیفت صبح"
  },
  "hoursIntoPeriod": 8.5,
  "hoursRemainingInPeriod": 15.5,
  "nextPeriod": {
    "Id": "period-24-36-2",
    "PeriodOrder": 2,
    "PeriodType": "rest",
    "DurationHours": 36
  },
  "cyclePosition": 32.5,
  "totalCycleHours": 60
}
```

---

## 🎨 رابط کاربری

### صفحه مدیریت الگوهای شیفت چرخشی

**دسترسی:** منوی کناری → تنظیمات → الگوهای شیفت چرخشی

#### ویژگی‌ها:

1. **نمایش الگوها**
   - کارت‌های زیبا با اطلاعات الگو
   - نمایش مدت چرخه
   - لیست دوره‌ها با نوع و مدت
   - دکمه‌های ویرایش، حذف و محاسبه

2. **ایجاد/ویرایش الگو**
   - نام و توضیحات الگو
   - مدت کل چرخه (ساعت)
   - افزودن/حذف دوره‌ها
   - تنظیم نوع هر دوره (کاری/استراحت/توقف)
   - تنظیم مدت هر دوره
   - تخصیص شیفت به دوره‌های کاری
   - اعتبارسنجی خودکار (مجموع دوره‌ها = مدت چرخه)

3. **محاسبه دوره فعلی**
   - انتخاب الگو
   - وارد کردن تاریخ شروع
   - وارد کردن تاریخ فعلی
   - نمایش دوره فعلی
   - نمایش زمان سپری شده و باقی‌مانده
   - نمایش دوره بعدی

---

## 🧮 الگوریتم محاسبه

### محاسبه دوره فعلی

```javascript
function calculateCurrentPeriod(pattern, startDate, currentDate) {
  // 1. محاسبه زمان سپری شده
  const elapsedMs = currentDate - startDate;
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  
  // 2. محاسبه موقعیت در چرخه
  const cyclePosition = elapsedHours % pattern.TotalCycleHours;
  
  // 3. پیدا کردن دوره فعلی
  let accumulatedHours = 0;
  let currentPeriod = null;
  
  for (const period of pattern.periods) {
    if (cyclePosition >= accumulatedHours && 
        cyclePosition < accumulatedHours + period.DurationHours) {
      currentPeriod = period;
      break;
    }
    accumulatedHours += period.DurationHours;
  }
  
  // 4. محاسبه زمان سپری شده در دوره فعلی
  const hoursIntoPeriod = cyclePosition - accumulatedHours;
  const hoursRemaining = currentPeriod.DurationHours - hoursIntoPeriod;
  
  return {
    currentPeriod,
    hoursIntoPeriod,
    hoursRemaining,
    cyclePosition
  };
}
```

### مثال محاسبه

**الگو:** 24 ساعت کار / 36 ساعت استراحت (چرخه 60 ساعته)

**تاریخ شروع:** 1403/01/01 08:00

**تاریخ فعلی:** 1403/01/03 16:30

**محاسبه:**
1. زمان سپری شده: 56.5 ساعت
2. موقعیت در چرخه: 56.5 % 60 = 56.5 ساعت
3. دوره فعلی: دوره اول (کاری) - چون 56.5 < 24 نیست، پس دوره دوم (استراحت)
4. زمان سپری شده در دوره استراحت: 56.5 - 24 = 32.5 ساعت
5. زمان باقی‌مانده: 36 - 32.5 = 3.5 ساعت

**نتیجه:** کارمند در دوره استراحت است و 3.5 ساعت تا شروع دوره کاری بعدی باقی مانده.

---

## 📝 مثال‌های کاربردی

### مثال 1: شیفت 24/36 (صنعت نفت و گاز)

**الگو:**
- دوره 1: 24 ساعت کار (شیفت صبح)
- دوره 2: 36 ساعت استراحت
- چرخه: 60 ساعت

**کاربرد:**
- سایت‌های نفتی دور از شهر
- کارکنان اقامتی
- کاهش هزینه‌های ایاب و ذهاب

### مثال 2: شیفت 12/24 (بیمارستان‌ها)

**الگو:**
- دوره 1: 12 ساعت کار (شیفت صبح)
- دوره 2: 24 ساعت استراحت
- چرخه: 36 ساعت

**کاربرد:**
- کادر درمان
- شیفت‌های طولانی
- استراحت کافی بین شیفت‌ها

### مثال 3: شیفت 8-8-8-8 (کارخانه‌ها)

**الگو:**
- دوره 1: 8 ساعت کار (شیفت صبح)
- دوره 2: 8 ساعت استراحت
- دوره 3: 8 ساعت کار (شیفت عصر)
- دوره 4: 8 ساعت استراحت
- چرخه: 32 ساعت

**کاربرد:**
- خطوط تولید پیوسته
- کارخانه‌های 24 ساعته
- تقسیم عادلانه شیفت‌ها

### مثال 4: الگوی سفارشی

**الگو:**
- دوره 1: 16 ساعت کار (شیفت صبح)
- دوره 2: 8 ساعت استراحت
- دوره 3: 16 ساعت کار (شیفت عصر)
- دوره 4: 8 ساعت استراحت
- چرخه: 48 ساعت

**کاربرد:**
- پروژه‌های خاص
- نیازهای سفارشی سازمان

---

## 🔧 نحوه استفاده

### مرحله 1: ایجاد الگو

1. به **تنظیمات → الگوهای شیفت چرخشی** بروید
2. روی **ایجاد الگوی جدید** کلیک کنید
3. اطلاعات الگو را وارد کنید:
   - نام الگو
   - توضیحات
   - مدت کل چرخه (ساعت)
4. دوره‌ها را اضافه کنید:
   - روی **افزودن دوره** کلیک کنید
   - نوع دوره را انتخاب کنید (کاری/استراحت/توقف)
   - مدت دوره را وارد کنید
   - برای دوره‌های کاری، شیفت مرتبط را انتخاب کنید
5. بررسی کنید مجموع مدت دوره‌ها با مدت چرخه مطابقت داشته باشد
6. روی **ایجاد الگو** کلیک کنید

### مرحله 2: تخصیص الگو به کارمند

1. به **تنظیمات → تخصیص شیفت** بروید
2. روی **تخصیص شیفت جدید** کلیک کنید
3. کارمند را انتخاب کنید
4. به جای انتخاب شیفت، **الگوی شیفت** را انتخاب کنید
5. تاریخ شروع را وارد کنید
6. روی **تخصیص** کلیک کنید

### مرحله 3: محاسبه دوره فعلی

1. به **تنظیمات → الگوهای شیفت چرخشی** بروید
2. روی آیکون **محاسبه** (Play) در کارت الگو کلیک کنید
3. تاریخ شروع الگو را وارد کنید
4. تاریخ فعلی را وارد کنید
5. روی **محاسبه** کلیک کنید
6. نتیجه محاسبه را مشاهده کنید:
   - دوره فعلی
   - زمان سپری شده در دوره
   - زمان باقی‌مانده تا پایان دوره
   - دوره بعدی

---

## 🎯 مزایا

### 1. **انعطاف‌پذیری**
- تعریف هر نوع الگوی شیفت چرخشی
- پشتیبانی از دوره‌های کاری و استراحت با مدت دلخواه
- امکان تخصیص شیفت‌های مختلف به دوره‌های کاری

### 2. **سهولت استفاده**
- رابط کاربری ساده و بصری
- اعتبارسنجی خودکار
- محاسبه خودکار دوره فعلی

### 3. **کارایی**
- کاهش خطاهای انسانی در محاسبه شیفت‌ها
- محاسبه خودکار دوره‌های کاری و استراحت
- امکان پیش‌بینی شیفت‌های آینده

### 4. **قابلیت ردیابی**
- لاگ کامل تمام تغییرات
- تاریخچه تخصیص الگوها
- گزارش‌گیری از الگوهای مورد استفاده

---

## 🔮 ویژگی‌های آینده

- [ ] تقویم بصری برای مشاهده الگوها
- [ ] پیش‌نمایش شیفت‌های آینده برای کارکنان
- [ ] اطلاع‌رسانی تغییر دوره (کاری/استراحت)
- [ ] گزارش‌گیری پیشرفته از الگوها
- [ ] پشتیبانی از الگوهای چند هفته‌ای
- [ ] امکان کپی کردن الگوها
- [ ] الگوهای از پیش تعریف شده برای صنایع مختلف

---

## 📊 آمار پیاده‌سازی

### فایل‌های ایجاد شده:
- ✅ `server/routes/shift-patterns.mjs` - Backend API
- ✅ `src/components/ShiftPatternsManagement.tsx` - Frontend UI
- ✅ `database/schema.sql` - Database tables (updated)

### فایل‌های تغییر یافته:
- ✅ `server/routes/employee-shifts.mjs` - Support for patterns
- ✅ `server/index.mjs` - Register new routes
- ✅ `src/utils/api.ts` - API functions
- ✅ `src/types.ts` - Type definitions
- ✅ `src/App.tsx` - Route registration
- ✅ `src/components/Sidebar.tsx` - Menu item

### API Endpoints جدید:
- 6 endpoint برای مدیریت الگوها
- 1 endpoint برای محاسبه دوره فعلی

### ویژگی‌های UI:
- نمایش الگوها به صورت کارت
- فرم ایجاد/ویرایش الگو
- مدیریت دوره‌ها با اعتبارسنجی
- محاسبه دوره فعلی با نمایش نتایج

---

## 🎉 نتیجه

✅ سیستم الگوهای شیفت چرخشی کامل پیاده‌سازی شد  
✅ پشتیبانی از الگوهای پیچیده با دوره‌های متعدد  
✅ محاسبه خودکار دوره فعلی  
✅ رابط کاربری ساده و بصری  
✅ اعتبارسنجی خودکار  
✅ مستندات کامل  

---

**نسخه**: 10.0  
**تاریخ**: 2024  
**وضعیت**: ✅ کامل و آماده استفاده  
**Build**: ✅ موفقیت‌آمیز
