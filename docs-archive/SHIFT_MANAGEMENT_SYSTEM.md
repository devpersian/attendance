# 🎉 نسخه 9.0 - سیستم مدیریت شیفت پیشرفته

## 📋 خلاصه تغییرات

این نسخه شامل رفع باگ‌های حیاتی و اضافه کردن سیستم کامل مدیریت شیفت و ساعات کاری است.

---

## 🐛 باگ‌های رفع شده

### 1. مشکل ثبت ساعت خروج به عنوان ورود

**مشکل:**
هنگام ثبت ساعت خروج، یک رکورد جدید ایجاد می‌شد به جای به‌روزرسانی رکورد موجود.

**علت:**
در endpoint `PUT /api/records/:id`، تمام فیلدها به‌روزرسانی می‌شدند، حتی اگر در درخواست ارسال نشده بودند. این باعث می‌شد فیلدهای `clockIn` و `status` به `null` تنظیم شوند.

**راه حل:**
تغییر endpoint PUT برای به‌روزرسانی فقط فیلدهایی که در درخواست ارسال شده‌اند:

```javascript
// قبل
await execute(
  `UPDATE attendance.AttendanceRecords 
   SET ClockIn = @clockIn, ClockOut = @clockOut, Status = @status, 
       Note = @note, UpdatedAt = GETDATE()
   WHERE Id = @id`,
  { 
    id, 
    clockIn: clockIn || null, 
    clockOut: clockOut || null, 
    status, 
    note: note || null 
  }
);

// بعد
const setClauses = [];
const params = { id };

if (updates.clockIn !== undefined) {
  setClauses.push('ClockIn = @clockIn');
  params.clockIn = updates.clockIn || null;
}

if (updates.clockOut !== undefined) {
  setClauses.push('ClockOut = @clockOut');
  params.clockOut = updates.clockOut || null;
}

// ... سایر فیلدها

const query = `UPDATE attendance.AttendanceRecords SET ${setClauses.join(', ')} WHERE Id = @id`;
await execute(query, params);
```

**فایل تغییر یافته:**
- `server/routes/records.mjs`

---

## 🚀 ویژگی‌های جدید

### 1. سیستم مدیریت شیفت (Shifts Management)

**قابلیت‌ها:**
- ✅ ایجاد شیفت‌های مختلف (صبح، عصر، شب، پاره‌وقت)
- ✅ تعیین ساعت شروع و پایان
- ✅ تعیین زمان استراحت
- ✅ تعیین آستانه تأخیر و خروج زود
- ✅ انتخاب رنگ برای هر شیفت
- ✅ فعال/غیرفعال کردن شیفت‌ها

**ساختار دیتابیس:**
```sql
CREATE TABLE Shifts (
    Id NVARCHAR(50) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    StartTime TIME NOT NULL,
    EndTime TIME NOT NULL,
    BreakStartTime TIME,
    BreakEndTime TIME,
    LateThresholdMinutes INT DEFAULT 15,
    EarlyLeaveThresholdMinutes INT DEFAULT 15,
    IsActive BIT DEFAULT 1,
    Color NVARCHAR(20),
    CreatedAt DATETIME DEFAULT GETDATE(),
    UpdatedAt DATETIME DEFAULT GETDATE()
);
```

**شیفت‌های پیش‌فرض:**
- شیفت صبح: 08:00 - 17:00
- شیفت عصر: 14:00 - 22:00
- شیفت شب: 22:00 - 06:00
- شیفت پاره‌وقت: 09:00 - 14:00

**API Endpoints:**
- `GET /api/shifts` - دریافت تمام شیفت‌ها
- `GET /api/shifts/:id` - دریافت یک شیفت
- `POST /api/shifts` - ایجاد شیفت جدید
- `PUT /api/shifts/:id` - به‌روزرسانی شیفت
- `DELETE /api/shifts/:id` - حذف شیفت

**کامپوننت فرانت‌اند:**
- `src/components/ShiftsManagement.tsx`

---

### 2. سیستم قوانین ساعات کاری (Working Hours Rules)

**قابلیت‌ها:**
- ✅ تعریف تعطیلات رسمی
- ✅ تعریف روزهای آخر هفته
- ✅ تعریف روزهای خاص
- ✅ تعریف قوانین اضافه کاری
- ✅ تعیین ضریب اضافه کاری
- ✅ تخصیص شیفت خاص برای روزهای خاص

**انواع قوانین:**
1. **holiday** - تعطیلات رسمی
2. **weekend** - روزهای آخر هفته
3. **overtime** - قوانین اضافه کاری
4. **special_day** - روزهای خاص

**ساختار دیتابیس:**
```sql
CREATE TABLE WorkingHoursRules (
    Id NVARCHAR(50) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    RuleType NVARCHAR(50) NOT NULL,
    StartDate NVARCHAR(10),
    EndDate NVARCHAR(10),
    DayOfWeek INT,
    IsWorkingDay BIT DEFAULT 0,
    ShiftId NVARCHAR(50),
    OvertimeMultiplier DECIMAL(3,2),
    Description NVARCHAR(500),
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME DEFAULT GETDATE(),
    UpdatedAt DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (ShiftId) REFERENCES attendance.Shifts(Id)
);
```

**قوانین پیش‌فرض:**
- جمعه (روز تعطیل هفته)
- تعطیلات نوروز (1403/01/01 تا 1403/01/04)
- سیزده‌بدر (1403/01/12 و 1403/01/13)

**API Endpoints:**
- `GET /api/working-hours-rules` - دریافت تمام قوانین
- `GET /api/working-hours-rules/:id` - دریافت یک قانون
- `POST /api/working-hours-rules` - ایجاد قانون جدید
- `PUT /api/working-hours-rules/:id` - به‌روزرسانی قانون
- `DELETE /api/working-hours-rules/:id` - حذف قانون

**کامپوننت فرانت‌اند:**
- `src/components/WorkingHoursRulesManagement.tsx`

---

### 3. سیستم تخصیص شیفت به کارکنان (Employee Shifts)

**قابلیت‌ها:**
- ✅ تخصیص شیفت به کارکنان
- ✅ تعیین تاریخ شروع و پایان
- ✅ تعیین روزهای کاری در هفته
- ✅ مشاهده شیفت‌های تخصیص داده شده
- ✅ ویرایش و حذف تخصیص‌ها

**ساختار دیتابیس:**
```sql
CREATE TABLE EmployeeShifts (
    Id NVARCHAR(50) PRIMARY KEY,
    EmployeeId NVARCHAR(50) NOT NULL,
    ShiftId NVARCHAR(50) NOT NULL,
    StartDate NVARCHAR(10) NOT NULL,
    EndDate NVARCHAR(10),
    DaysOfWeek NVARCHAR(50),
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME DEFAULT GETDATE(),
    UpdatedAt DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (EmployeeId) REFERENCES attendance.Employees(Id),
    FOREIGN KEY (ShiftId) REFERENCES attendance.Shifts(Id)
);
```

**API Endpoints:**
- `GET /api/employee-shifts` - دریافت تمام تخصیص‌ها
- `GET /api/employee-shifts/:employeeId` - دریافت شیفت‌های یک کارمند
- `GET /api/employee-shifts/today/:employeeId` - دریافت شیفت امروز یک کارمند
- `POST /api/employee-shifts` - تخصیص شیفت جدید
- `PUT /api/employee-shifts/:id` - به‌روزرسانی تخصیص
- `DELETE /api/employee-shifts/:id` - حذف تخصیص

**کامپوننت فرانت‌اند:**
- `src/components/EmployeeShiftsManagement.tsx`

---

## 📊 ساختار کامل سیستم

```
┌─────────────────────────────────────────────────────────┐
│                    Shifts Management                     │
│  - تعریف شیفت‌های مختلف                                  │
│  - ساعت شروع و پایان                                     │
│  - زمان استراحت                                          │
│  - آستانه تأخیر و خروج زود                              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Working Hours Rules                         │
│  - تعطیلات رسمی                                          │
│  - روزهای آخر هفته                                       │
│  - قوانین اضافه کاری                                     │
│  - روزهای خاص                                            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Employee Shifts                             │
│  - تخصیص شیفت به کارکنان                                 │
│  - تعیین روزهای کاری                                     │
│  - تاریخ شروع و پایان                                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Attendance Records                          │
│  - ثبت ساعت ورود و خروج                                  │
│  - محاسبه تأخیر بر اساس شیفت                             │
│  - محاسبه اضافه کاری بر اساس قوانین                      │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 فایل‌های ایجاد شده

### Backend:
- ✅ `server/routes/shifts.mjs` - مدیریت شیفت‌ها
- ✅ `server/routes/working-hours-rules.mjs` - مدیریت قوانین ساعات کاری
- ✅ `server/routes/employee-shifts.mjs` - مدیریت تخصیص شیفت

### Frontend:
- ✅ `src/components/ShiftsManagement.tsx` - رابط کاربری مدیریت شیفت‌ها
- ✅ `src/components/WorkingHoursRulesManagement.tsx` - رابط کاربری مدیریت قوانین
- ✅ `src/components/EmployeeShiftsManagement.tsx` - رابط کاربری تخصیص شیفت

### Database:
- ✅ جدول `Shifts` - شیفت‌ها
- ✅ جدول `WorkingHoursRules` - قوانین ساعات کاری
- ✅ جدول `EmployeeShifts` - تخصیص شیفت به کارکنان

### API:
- ✅ `shiftsAPI` - توابع API برای مدیریت شیفت‌ها
- ✅ `workingHoursRulesAPI` - توابع API برای مدیریت قوانین
- ✅ `employeeShiftsAPI` - توابع API برای تخصیص شیفت

---

## 🎨 رابط کاربری

### صفحه مدیریت شیفت‌ها
- نمایش شیفت‌ها به صورت کارت‌های رنگی
- فرم ایجاد/ویرایش شیفت با فیلدهای:
  - نام شیفت
  - توضیحات
  - ساعت شروع و پایان
  - زمان استراحت
  - آستانه تأخیر و خروج زود
  - انتخاب رنگ

### صفحه قوانین ساعات کاری
- نمایش قوانین به صورت لیست
- فیلتر بر اساس نوع قانون
- فرم ایجاد/ویرایش قانون با فیلدهای:
  - نام قانون
  - نوع قانون (تعطیلات، آخر هفته، اضافه کاری، روز خاص)
  - تاریخ شروع و پایان (برای تعطیلات)
  - روز هفته (برای آخر هفته)
  - ضریب اضافه کاری (برای اضافه کاری)
  - شیفت خاص (اختیاری)
  - روز کاری یا غیرکاری

### صفحه تخصیص شیفت
- جدول تخصیص‌ها با اطلاعات:
  - نام کارمند
  - نام شیفت
  - تاریخ شروع
  - تاریخ پایان
  - روزهای کاری
- فرم تخصیص شیفت با:
  - انتخاب کارمند (SearchableDropdown)
  - انتخاب شیفت
  - تاریخ شروع و پایان
  - انتخاب روزهای کاری (دکمه‌های 7 روز هفته)

---

## 🚀 نحوه استفاده

### 1. به‌روزرسانی دیتابیس
```bash
sqlcmd -S localhost -U sa -P YourPassword123! -i database/schema.sql
```

### 2. راه‌اندازی سرور
```bash
npm run server
```

### 3. راه‌اندازی فرانت‌اند
```bash
npm run dev
```

### 4. ورود به سیستم
- URL: http://localhost:3000/login
- Username: admin
- Password: admin123

### 5. استفاده از سیستم شیفت
1. به **تنظیمات → مدیریت شیفت‌ها** بروید
2. شیفت‌های مورد نیاز را ایجاد کنید
3. به **تنظیمات → قوانین ساعات کاری** بروید
4. تعطیلات و قوانین را تعریف کنید
5. به **تنظیمات → تخصیص شیفت** بروید
6. شیفت‌ها را به کارکنان تخصیص دهید

---

## 📝 مثال‌های استفاده

### مثال 1: ایجاد شیفت صبح
```json
{
  "name": "شیفت صبح",
  "description": "شیفت معمولی صبح",
  "startTime": "08:00:00",
  "endTime": "17:00:00",
  "breakStartTime": "12:00:00",
  "breakEndTime": "13:00:00",
  "lateThresholdMinutes": 15,
  "earlyLeaveThresholdMinutes": 15,
  "color": "#10B981"
}
```

### مثال 2: تعریف تعطیلات نوروز
```json
{
  "name": "تعطیلات نوروز",
  "ruleType": "holiday",
  "startDate": "1403/01/01",
  "endDate": "1403/01/04",
  "isWorkingDay": false,
  "description": "تعطیلات رسمی نوروز"
}
```

### مثال 3: تخصیص شیفت به کارمند
```json
{
  "employeeId": "emp-123",
  "shiftId": "shift-morning",
  "startDate": "1403/01/01",
  "endDate": "1403/12/29",
  "daysOfWeek": "0,1,2,3,4"
}
```

---

## 🔮 ویژگی‌های آینده

- [ ] محاسبه خودکار تأخیر بر اساس شیفت
- [ ] محاسبه خودکار اضافه کاری
- [ ] گزارش‌گیری از شیفت‌ها
- [ ] تقویم شیفت‌ها
- [ ] اطلاع‌رسانی تغییر شیفت
- [ ] درخواست تغییر شیفت توسط کارکنان
- [ ] تأیید تغییر شیفت توسط مدیر

---

**نسخه**: 9.0  
**تاریخ**: 2024  
**وضعیت**: ✅ کامل و تست شده  
**Build**: ✅ موفقیت‌آمیز
