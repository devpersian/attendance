# 🔄 مهاجرت به Schema اختصاصی `attendance`

## 📋 خلاصه تغییرات

تمام جداول دیتابیس از schema پیش‌فرض `dbo` به schema اختصاصی `attendance` منتقل شدند.

---

## 🎯 مزایای استفاده از Schema اختصاصی

### 1. **جداسازی منطقی**
- ✅ تمام جداول مربوط به سیستم حضور و غیاب در یک schema واحد
- ✅ جلوگیری از تداخل با سایر برنامه‌ها
- ✅ سازماندهی بهتر

### 2. **مدیریت دسترسی‌ها**
- ✅ امکان تنظیم دسترسی‌های خاص برای schema `attendance`
- ✅ امنیت بیشتر
- ✅ مدیریت آسان‌تر

### 3. **نام‌گذاری واضح**
- ✅ `attendance.Employees` به جای `dbo.Employees`
- ✅ مشخص است که جدول متعلق به کدام سیستم است

---

## 📊 جداول منتقل شده

تمام 20 جدول به schema `attendance` منتقل شدند:

1. `attendance.Employees`
2. `attendance.AttendanceRecords`
3. `attendance.LeaveRequests`
4. `attendance.Devices`
5. `attendance.DeviceLogs`
6. `attendance.DeviceAttendanceLogs`
7. `attendance.SystemLogs`
8. `attendance.CompanyInfo`
9. `attendance.Users`
10. `attendance.Roles`
11. `attendance.Permissions`
12. `attendance.RolePermissions`
13. `attendance.UserRoles`
14. `attendance.Shifts`
15. `attendance.ShiftPatterns`
16. `attendance.ShiftPatternPeriods`
17. `attendance.WorkingHoursRules`
18. `attendance.EmployeeShifts`

---

## 🔧 فایل‌های به‌روزرسانی شده

### Database Scripts:
- ✅ `database/schema.sql` - ایجاد جداول با schema `attendance`
- ✅ `database/clean-db.sql` - پاک کردن و insert داده‌های اولیه
- ✅ `database/verify-schema.sql` - بررسی schema

### Backend Routes:
- ✅ `server/routes/employees.mjs`
- ✅ `server/routes/records.mjs`
- ⏳ `server/routes/leaves.mjs` - نیاز به به‌روزرسانی
- ⏳ `server/routes/devices.mjs` - نیاز به به‌روزرسانی
- ⏳ `server/routes/admin.mjs` - نیاز به به‌روزرسانی
- ⏳ `server/routes/auth.mjs` - نیاز به به‌روزرسانی
- ⏳ `server/routes/users.mjs` - نیاز به به‌روزرسانی
- ⏳ `server/routes/roles.mjs` - نیاز به به‌روزرسانی
- ⏳ `server/routes/permissions.mjs` - نیاز به به‌روزرسانی
- ⏳ `server/routes/user-roles.mjs` - نیاز به به‌روزرسانی
- ⏳ `server/routes/shifts.mjs` - نیاز به به‌روزرسانی

### Backend Services:
- ⏳ `server/services/deviceService.mjs` - نیاز به به‌روزرسانی
- ⏳ `server/services/auth.mjs` - نیاز به به‌روزرسانی

### Scripts:
- ⏳ `server/seed.mjs` - نیاز به به‌روزرسانی
- ⏳ `server/seed-admin.mjs` - نیاز به به‌روزرسانی

---

## 🚀 نحوه مهاجرت

### مرحله 1: به‌روزرسانی دیتابیس

```bash
# ایجاد schema و جداول جدید
sqlcmd -S localhost -U sa -P YourPassword123! -i database/schema.sql

# پاک کردن داده‌ها و insert داده‌های اولیه
sqlcmd -S localhost -U sa -P YourPassword123! -i database/clean-db.sql
```

### مرحله 2: به‌روزرسانی Backend

تمام فایل‌های backend باید به‌روزرسانی شوند تا از schema `attendance` استفاده کنند.

**مثال:**
```javascript
// قبل
const employees = await execute('SELECT * FROM attendance.Employees');

// بعد
const employees = await execute('SELECT * FROM attendance.Employees');
```

### مرحله 3: تست

```bash
# تنظیم رمز عبور admin
npm run seed:admin

# راه‌اندازی سرور
npm run server

# راه‌اندازی فرانت‌اند
npm run dev
```

---

## 📝 Script به‌روزرسانی خودکار

یک script برای به‌روزرسانی خودکار تمام فایل‌ها ایجاد شده است:

```bash
# در Linux/Mac
chmod +x update-schema.sh
./update-schema.sh

# در Windows (با Git Bash)
bash update-schema.sh
```

این script تمام فایل‌های `.mjs` در پوشه `server` را به‌روزرسانی می‌کند.

---

## 🔍 بررسی Schema

برای بررسی اینکه تمام جداول در schema `attendance` هستند:

```sql
USE AttendanceDB;
GO

SELECT 
    s.name AS SchemaName,
    t.name AS TableName
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = 'attendance'
ORDER BY t.name;
```

---

## 💡 نکات مهم

### 1. **Foreign Key Constraints**
تمام foreign key constraints به schema جدید اشاره می‌کنند:
```sql
CONSTRAINT [FK_AttendanceRecords_Employees] 
FOREIGN KEY ([EmployeeId]) REFERENCES [attendance].[Employees]([Id])
```

### 2. **Stored Procedures**
Stored procedures نیز در schema `attendance` ایجاد شده‌اند:
```sql
CREATE PROCEDURE [attendance].[GetAttendanceByDateAndEmployee]
```

### 3. **Indexes**
تمام ایندکس‌ها در schema `attendance` ایجاد شده‌اند:
```sql
CREATE INDEX [IX_AttendanceRecords_Date] 
ON [attendance].[AttendanceRecords] ([Date]);
```

---

## 🎯 نتیجه

✅ تمام جداول به schema `attendance` منتقل شدند  
✅ فایل‌های database به‌روزرسانی شدند  
✅ برخی فایل‌های backend به‌روزرسانی شدند  
✅ Script به‌روزرسانی خودکار ایجاد شد  

---

## 📚 فایل‌های ایجاد شده

- ✅ `database/schema.sql` - با schema `attendance`
- ✅ `database/clean-db.sql` - با schema `attendance`
- ✅ `database/verify-schema.sql` - بررسی schema
- ✅ `update-schema.sh` - Script به‌روزرسانی خودکار
- ✅ `server/update-schema.mjs` - Script Node.js
- ✅ `SCHEMA_MIGRATION.md` - این فایل

---

**نسخه**: 10.3  
**تاریخ**: 2024  
**وضعیت**: 🔄 در حال انجام  
**Schema**: `attendance` (به جای `dbo`)
