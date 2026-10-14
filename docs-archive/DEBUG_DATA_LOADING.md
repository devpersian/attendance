# 🔍 راهنمای عیب‌یابی مشکلات بارگذاری داده‌ها

## 🐛 مشکل گزارش شده

داده‌ها به درستی در dropdown ها و لیست‌ها بارگذاری نمی‌شوند.

---

## ✅ راه حل‌های اعمال شده

### 1. **اضافه کردن Logging پیشرفته**

توابع `getEmployees`, `getRecords`, `getLeaves` حالا لاگ‌های دقیقی در console نمایش می‌دهند:

```javascript
📊 Loading employees...
🌐 Fetching employees from API...
📥 Raw employees from API: [...]
✅ Normalized employees: [...]
```

### 2. **توابع Refresh جدید**

توابع جدید برای بارگذاری مجدد داده‌ها بدون cache:

```typescript
refreshEmployees()  // بارگذاری مجدد کارکنان
refreshRecords()    // بارگذاری مجدد سوابق
refreshLeaves()     // بارگذاری مجدد مرخصی‌ها
clearCache()        // پاک کردن کامل cache
```

### 3. **دکمه بارگذاری مجدد**

دکمه "بارگذاری مجدد" به صفحات زیر اضافه شد:
- ✅ کارکنان
- ✅ مرخصی‌ها

این دکمه cache را دور می‌زند و داده‌های تازه را از API دریافت می‌کند.

---

## 🧪 مراحل عیب‌یابی

### مرحله 1: بررسی Console Browser

1. مرورگر را باز کنید (Chrome/Firefox)
2. **F12** را بزنید (Developer Tools)
3. به تب **Console** بروید
4. صفحه را refresh کنید (F5)
5. لاگ‌های زیر را بررسی کنید:

```
📊 Loading employees...
🌐 Fetching employees from API...
📥 Raw employees from API: [...]
✅ Normalized employees: [...]
```

### مرحله 2: بررسی Network Tab

1. در Developer Tools، به تب **Network** بروید
2. صفحه را refresh کنید
3. درخواست‌های API را بررسی کنید:
   - `GET /api/employees` - باید status 200 باشد
   - `GET /api/records` - باید status 200 باشد
   - `GET /api/leaves` - باید status 200 باشد

4. روی هر درخواست کلیک کنید و **Response** را بررسی کنید:
   - آیا داده‌ها به درستی برمی‌گردند؟
   - آیا فرمت داده‌ها صحیح است؟

### مرحله 3: بررسی Console Server

1. ترمینال سرور را باز کنید
2. لاگ‌های زیر را بررسی کنید:

```
[INFO] READ employees - Fetched X employees
[INFO] READ records - Fetched X records
[INFO] READ leaves - Fetched X leaves
```

### مرحله 4: استفاده از دکمه بارگذاری مجدد

1. به صفحه **کارکنان** یا **مرخصی‌ها** بروید
2. روی دکمه **بارگذاری مجدد** کلیک کنید
3. Console browser را بررسی کنید:

```
🔄 Manual refresh triggered
📊 Loading employees... { forceRefresh: true }
🗑️ Clearing all caches...
✅ Caches cleared
🔄 Force refreshing employees...
🌐 Fetching employees from API...
📥 Raw employees from API: [...]
✅ Normalized employees: [...]
✅ Loaded employees: X
```

---

## 🔧 مشکلات رایج و راه حل‌ها

### مشکل 1: Cache قدیمی

**علامت:**
- داده‌های جدید نمایش داده نمی‌شوند
- بعد از اضافه کردن کارمند جدید، در لیست ظاهر نمی‌شود

**راه حل:**
```javascript
// در Console browser اجرا کنید:
localStorage.clear();
location.reload();
```

یا از دکمه **بارگذاری مجدد** استفاده کنید.

---

### مشکل 2: API خطا می‌دهد

**علامت:**
- در Network tab، status code 401 یا 403 می‌بینید
- Console error: `HTTP error! status: 401`

**راه حل:**
1. مطمئن شوید که وارد سیستم شده‌اید
2. توکن JWT را بررسی کنید:
   ```javascript
   // در Console browser:
   localStorage.getItem('auth_token')
   ```
3. اگر توکن وجود ندارد، دوباره وارد شوید
4. اگر توکن منقضی شده، دوباره وارد شوید

---

### مشکل 3: داده‌ها normalize نمی‌شوند

**علامت:**
- در Console، `Raw employees from API` داده‌ها را نشان می‌دهد
- اما `Normalized employees` خالی است

**راه حل:**
1. فرمت داده‌های API را بررسی کنید
2. باید یکی از این فرمت‌ها باشد:
   ```json
   // فرمت 1: PascalCase (از SQL Server)
   { "Id": "1", "Name": "علی", "PersonnelCode": "1001" }
   
   // فرمت 2: camelCase (استاندارد)
   { "id": "1", "name": "علی", "personnelCode": "1001" }
   ```

3. تابع `normalizeEmployee` در `storage.ts` را بررسی کنید

---

### مشکل 4: Backend داده برنمی‌گرداند

**علامت:**
- در Network tab، response خالی است
- Console server خطا نشان می‌دهد

**راه حل:**
1. Console server را بررسی کنید
2. مطمئن شوید SQL Server در حال اجرا است
3. مطمئن شوید جداول وجود دارند:
   ```sql
   SELECT * FROM attendance.Employees;
   SELECT * FROM attendance.AttendanceRecords;
   SELECT * FROM attendance.LeaveRequests;
   ```

---

## 📊 بررسی دقیق داده‌ها

### بررسی Employees

در Console browser اجرا کنید:

```javascript
// دریافت مستقیم از API
fetch('http://localhost:3001/api/employees', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
  }
})
.then(r => r.json())
.then(data => console.log('Employees:', data));
```

### بررسی Records

```javascript
fetch('http://localhost:3001/api/records', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
  }
})
.then(r => r.json())
.then(data => console.log('Records:', data));
```

### بررسی Leaves

```javascript
fetch('http://localhost:3001/api/leaves', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
  }
})
.then(r => r.json())
.then(data => console.log('Leaves:', data));
```

---

## 🎯 تست کامل

### سناریو 1: بارگذاری اولیه

1. سرور را شروع کنید: `npm run server`
2. فرانت‌اند را شروع کنید: `npm run dev`
3. وارد سیستم شوید
4. به صفحه **کارکنان** بروید
5. Console browser را باز کنید
6. باید ببینید:
   ```
   📊 Loading employees...
   🌐 Fetching employees from API...
   📥 Raw employees from API: [...]
   ✅ Normalized employees: [...]
   ✅ Loaded employees: X
   ```

### سناریو 2: بارگذاری مجدد

1. به صفحه **کارکنان** بروید
2. روی دکمه **بارگذاری مجدد** کلیک کنید
3. Console browser را بررسی کنید:
   ```
   🔄 Manual refresh triggered
   📊 Loading employees... { forceRefresh: true }
   🗑️ Clearing all caches...
   ✅ Caches cleared
   🔄 Force refreshing employees...
   ```

### سناریو 3: بررسی Network

1. Developer Tools را باز کنید (F12)
2. به تب **Network** بروید
3. صفحه را refresh کنید
4. درخواست‌های API را بررسی کنید:
   - `GET /api/employees` - status 200
   - Response باید آرایه‌ای از کارکنان باشد

---

## 📝 فایل‌های تغییر یافته

### Backend:
- ✅ `server/routes/employees.mjs` - لاگ‌های دقیق‌تر
- ✅ `server/routes/records.mjs` - لاگ‌های دقیق‌تر
- ✅ `server/routes/leaves.mjs` - لاگ‌های دقیق‌تر

### Frontend:
- ✅ `src/utils/storage.ts` - توابع refresh و logging
- ✅ `src/utils/api.ts` - مدیریت خطای بهتر
- ✅ `src/components/Employees.tsx` - دکمه refresh
- ✅ `src/components/Leaves.tsx` - دکمه refresh

---

## 💡 نکات مهم

### 1. **Cache TTL**
Cache هر 5 دقیقه منقضی می‌شود. اگر داده‌های جدید اضافه کردید، از دکمه **بارگذاری مجدد** استفاده کنید.

### 2. **Authentication**
تمام درخواست‌های API نیاز به توکن JWT دارند. مطمئن شوید که وارد سیستم شده‌اید.

### 3. **CORS**
اگر خطای CORS می‌بینید، مطمئن شوید که `FRONTEND_URL` در `.env` درست تنظیم شده است.

### 4. **SQL Server**
مطمئن شوید که SQL Server در حال اجرا است و جداول وجود دارند.

---

## 🚨 اگر مشکل حل نشد

### مرحله 1: بررسی Console Browser
- تمام لاگ‌ها را کپی کنید
- پیام‌های خطا را یادداشت کنید

### مرحله 2: بررسی Console Server
- تمام لاگ‌ها را کپی کنید
- پیام‌های خطا را یادداشت کنید

### مرحله 3: بررسی Network Tab
- درخواست‌های API را بررسی کنید
- Status code و Response را یادداشت کنید

### مرحله 4: ارسال اطلاعات
اطلاعات زیر را ارسال کنید:
1. لاگ‌های Console browser
2. لاگ‌های Console server
3. Status code و Response از Network tab
4. توضیح مشکل

---

**تاریخ:** 2024  
**وضعیت:** ✅ ابزارهای debug اضافه شدند  
**Build:** ✅ موفقیت‌آمیز
