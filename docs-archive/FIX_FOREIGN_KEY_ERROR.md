# 🔧 رفع خطای FOREIGN KEY در ثبت کاربر

## 🐛 مشکل گزارش شده

**خطا در کنسول سرور:**
```
error: `The INSERT statement conflicted with the FOREIGN KEY constraint "FK_Users_Employees". 
The conflict occurred in database "test", table "dbo.Employees", column 'Id'.`
```

**علت:**
وقتی کاربر جدیدی ثبت می‌شد، `employeeId` به صورت رشته خالی `''` ارسال می‌شد. اما دیتابیس انتظار داشت که این فیلد یا `NULL` باشد یا یک شناسه معتبر از جدول `Employees`.

---

## ✅ راه حل اعمال شده

### 1. **فرانت‌اند (UserManagement.tsx)**

#### الف) تبدیل employeeId خالی به null
```typescript
const handleSave = async () => {
  // Convert empty employeeId to null
  const dataToSave = {
    ...formData,
    employeeId: formData.employeeId || null
  };
  
  // ...
};
```

#### ب) اضافه کردن dropdown برای انتخاب کارمند
```typescript
// بارگذاری لیست کارکنان
const loadEmployees = async () => {
  try {
    const emps = await getEmployees();
    setEmployees(emps);
  } catch (error) {
    console.error('Error loading employees:', error);
  }
};

// فیلد انتخاب کارمند در فرم
<div className="ent-form-group">
  <label className="ent-form-label">کارمند مرتبط (اختیاری)</label>
  <select
    value={formData.employeeId}
    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
    className="ent-input"
  >
    <option value="">-- انتخاب کارمند --</option>
    {employees.map(emp => (
      <option key={emp.id} value={emp.id}>
        {emp.name} - {emp.personnelCode}
      </option>
    ))}
  </select>
  <p className="ent-caption mt-1">
    اگر این کاربر به یک کارمند مرتبط است، آن را انتخاب کنید
  </p>
</div>
```

#### ج) مدیریت خطاهای بهتر
```typescript
catch (error: any) {
  let errorMessage = 'خطا در ذخیره کاربر';
  if (error.message) {
    if (error.message.includes('FOREIGN KEY')) {
      errorMessage = 'کارمند انتخاب شده معتبر نیست';
    } else if (error.message.includes('duplicate') || error.message.includes('تکراری')) {
      errorMessage = 'این نام کاربری قبلاً ثبت شده است';
    } else if (error.details) {
      errorMessage = error.details;
    } else {
      errorMessage = error.message;
    }
  }
  
  toast.error(errorMessage);
}
```

---

### 2. **بک‌اند (auth.mjs)**

#### الف) دریافت employeeId از request
```javascript
const { username, password, email, role, employeeId } = req.body;
```

#### ب) اعتبارسنجی employeeId
```javascript
// Validate employeeId if provided
let finalEmployeeId = null;
if (employeeId && employeeId !== '') {
  console.log('🔍 Validating employeeId:', employeeId);
  const existingEmployee = await execute(
    'SELECT Id FROM attendance.Employees WHERE Id = @id',
    { id: employeeId }
  );

  if (existingEmployee.length === 0) {
    console.log('❌ Employee not found:', employeeId);
    await Logger.log('warning', 'REGISTER_FAILED', 'auth', req.user.id, 
      `Employee not found: ${employeeId}`, { employeeId });
    return res.status(400).json({ 
      error: 'کارمند انتخاب شده معتبر نیست',
      details: `EmployeeId "${employeeId}" در جدول Employees یافت نشد`
    });
  }
  finalEmployeeId = employeeId;
}
```

#### ج) استفاده از employeeId معتبر در INSERT
```javascript
await execute(
  `INSERT INTO attendance.Users (Id, Username, PasswordHash, Email, Role, IsActive, EmployeeId, CreatedAt)
   VALUES (@id, @username, @passwordHash, @email, @role, 1, @employeeId, GETDATE())`,
  {
    id: userId,
    username,
    passwordHash,
    email: email || null,
    role,
    employeeId: finalEmployeeId  // null یا شناسه معتبر
  }
);
```

---

## 🎯 نحوه استفاده

### مرحله 1: ری‌استارت سرور
```bash
npm run stop
npm run server
```

### مرحله 2: ثبت کاربر جدید
1. به **تنظیمات → مدیریت کاربران** بروید
2. روی **افزودن کاربر** کلیک کنید
3. اطلاعات کاربر را وارد کنید
4. **کارمند مرتبط** را انتخاب کنید (اختیاری)
   - اگر کاربر به یک کارمند مرتبط است، از dropdown انتخاب کنید
   - اگر نه، گزینه "-- انتخاب کارمند --" را بگذارید
5. روی **افزودن کاربر** کلیک کنید

### مرحله 3: مشاهده نتیجه
- ✅ اگر همه چیز درست باشد: پیام موفقیت نمایش داده می‌شود
- ❌ اگر خطایی رخ دهد: پیام خطای دقیق در UI نمایش داده می‌شود

---

## 📊 پیام‌های خطای جدید

### 1. **کارمند نامعتبر**
```
❌ کارمند انتخاب شده معتبر نیست
```
**علت:** employeeId ارسال شده در جدول Employees وجود ندارد

**راه حل:** یک کارمند معتبر از dropdown انتخاب کنید یا گزینه "-- انتخاب کارمند --" را بگذارید

### 2. **نام کاربری تکراری**
```
❌ این نام کاربری قبلاً ثبت شده است
```
**علت:** نام کاربری تکراری است

**راه حل:** از نام کاربری دیگری استفاده کنید

### 3. **رمز عبور کوتاه**
```
❌ رمز عبور باید حداقل 6 کاراکتر باشد
```
**علت:** رمز عبور کمتر از 6 کاراکتر است

**راه حل:** رمز عبور طولانی‌تری انتخاب کنید

### 4. **فیلدهای الزامی**
```
❌ نام کاربری و رمز عبور الزامی است
```
**علت:** نام کاربری یا رمز عبور خالی است

**راه حل:** تمام فیلدهای الزامی را پر کنید

---

## 🔍 لاگ‌های سرور

حالا در کنسول سرور، لاگ‌های دقیق‌تری را خواهید دید:

### ثبت کاربر موفق:
```
📝 Register attempt: { username: 'newuser', role: 'employee', email: 'user@company.com' }
🔍 Checking if username exists: newuser
🔍 Validating employeeId: emp-123
🔐 Hashing password...
✅ Password hashed successfully
💾 Inserting user to database: { userId: 'user-...', username: 'newuser', role: 'employee', employeeId: 'emp-123' }
✅ User inserted successfully
✅ User registered successfully: newuser
```

### ثبت کاربر با خطا (کارمند نامعتبر):
```
📝 Register attempt: { username: 'newuser', role: 'employee', email: 'user@company.com' }
🔍 Checking if username exists: newuser
🔍 Validating employeeId: invalid-id
❌ Employee not found: invalid-id
```

---

## 📁 فایل‌های تغییر یافته

### فرانت‌اند:
- ✅ `src/components/UserManagement.tsx`
  - اضافه کردن state برای employees
  - بارگذاری لیست کارکنان
  - اضافه کردن dropdown برای انتخاب کارمند
  - تبدیل employeeId خالی به null
  - مدیریت خطاهای بهتر

### بک‌اند:
- ✅ `server/routes/auth.mjs`
  - دریافت employeeId از request
  - اعتبارسنجی employeeId قبل از INSERT
  - تبدیل employeeId خالی به null
  - لاگ‌های دقیق‌تر
  - پیام‌های خطای واضح‌تر

---

## 🎨 بهبودهای UI

### 1. **Dropdown انتخاب کارمند**
- نمایش لیست تمام کارکنان
- فرمت: `نام کارمند - کد پرسنلی`
- گزینه پیش‌فرض: `-- انتخاب کارمند --`
- توضیح: "اگر این کاربر به یک کارمند مرتبط است، آن را انتخاب کنید"

### 2. **پیام‌های خطای واضح**
- نمایش خطا در UI (نه فقط در کنسول)
- پیام‌های فارسی و قابل فهم
- تشخیص نوع خطا و نمایش پیام مناسب

### 3. **لاگ‌های دقیق در سرور**
- نمایش مرحله به مرحله عملیات
- آیکون‌های رنگی برای تشخیص آسان
- جزئیات کامل برای عیب‌یابی

---

## 🧪 تست کردن

### سناریو 1: ثبت کاربر بدون کارمند مرتبط
1. فرم را پر کنید
2. dropdown کارمند را روی "-- انتخاب کارمند --" بگذارید
3. ذخیره کنید
4. ✅ باید موفقیت‌آمیز باشد

### سناریو 2: ثبت کاربر با کارمند مرتبط
1. فرم را پر کنید
2. یک کارمند از dropdown انتخاب کنید
3. ذخیره کنید
4. ✅ باید موفقیت‌آمیز باشد

### سناریو 3: ثبت کاربر با employeeId نامعتبر (تست دستی)
1. در Developer Tools، مقدار employeeId را به یک شناسه نامعتبر تغییر دهید
2. ذخیره کنید
3. ❌ باید خطای "کارمند انتخاب شده معتبر نیست" نمایش داده شود

---

## 📝 نکات مهم

### 1. **employeeId اختیاری است**
- اگر کاربر به یک کارمند مرتبط است، employeeId را تنظیم کنید
- اگر نه، آن را خالی بگذارید (null می‌شود)

### 2. **اعتبارسنجی در هر دو طرف**
- فرانت‌اند: تبدیل رشته خالی به null
- بک‌اند: بررسی وجود employeeId در جدول Employees

### 3. **پیام‌های خطای واضح**
- خطاها در UI نمایش داده می‌شوند
- پیام‌ها به فارسی و قابل فهم هستند
- جزئیات خطا در لاگ‌های سرور موجود است

---

## 🎉 نتیجه

✅ خطای FOREIGN KEY برطرف شد  
✅ dropdown انتخاب کارمند اضافه شد  
✅ پیام‌های خطا در UI نمایش داده می‌شوند  
✅ لاگ‌های دقیق در سرور اضافه شدند  
✅ اعتبارسنجی در هر دو طرف انجام می‌شود  

---

**تاریخ اصلاح:** 2024  
**وضعیت:** ✅ کامل و تست شده  
**Build:** ✅ موفقیت‌آمیز
