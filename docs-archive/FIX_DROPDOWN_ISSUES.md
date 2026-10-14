# 🔧 راهنمای رفع مشکلات Dropdown ها

## 🐛 مشکلات رایج Dropdown ها

### مشکل 1: مقادیر undefined نمایش داده می‌شوند

**علامت:**
- در dropdown، مقادیر به صورت "undefined" یا خالی نمایش داده می‌شوند
- Console error: `Cannot read property 'name' of undefined`

**علت:**
- داده‌های API فرمت درستی ندارند
- فیلدهای ضروری (name, personnelCode, department) وجود ندارند
- Normalization به درستی کار نمی‌کند

**راه حل اعمال شده:**
تمام dropdown ها حالا از fallback values استفاده می‌کنند:

```tsx
{employees.map(emp => (
  <option key={emp.id} value={emp.id}>
    {emp.name || 'نامشخص'} - {emp.personnelCode || '---'} ({emp.department || 'نامشخص'})
  </option>
))}
```

---

### مشکل 2: Dropdown خالی است

**علامت:**
- هیچ گزینه‌ای در dropdown نمایش داده نمی‌شود
- Console log: `✅ Loaded employees: 0`

**علت:**
- API داده‌ای برنمی‌گرداند
- Cache خالی است
- Local storage خالی است

**راه حل:**
1. دکمه **بارگذاری مجدد** را کلیک کنید
2. Console browser را بررسی کنید:
   ```
   🔄 Manual refresh triggered
   🗑️ Clearing all caches...
   🌐 Fetching employees from API...
   📥 Raw employees from API: [...]
   ```
3. اگر آرایه خالی است، مشکل از backend است

---

### مشکل 3: Dropdown مقادیر را نشان نمی‌دهد

**علامت:**
- Dropdown باز می‌شود اما گزینه‌ها خالی هستند
- یا گزینه‌ها به صورت "undefined" نمایش داده می‌شوند

**علت:**
- داده‌ها به درستی normalize نشده‌اند
- فرمت داده‌های API با فرمت مورد انتظار متفاوت است

**راه حل:**

#### مرحله 1: بررسی Console
```
📥 Raw employees from API: [
  { Id: "1", Name: "علی", PersonnelCode: "1001", Department: "IT" },
  ...
]
✅ Normalized employees: [
  { id: "1", name: "علی", personnelCode: "1001", department: "IT" },
  ...
]
```

اگر `Raw employees` داده‌ها را نشان می‌دهد اما `Normalized employees` خالی است، مشکل در تابع `normalizeEmployee` است.

#### مرحله 2: بررسی تابع normalize

در `src/utils/storage.ts`:

```typescript
function normalizeEmployee(emp: any): Employee {
  return {
    id: emp.Id || emp.id,
    name: emp.Name || emp.name || '',
    personnelCode: emp.PersonnelCode || emp.personnelCode || '',
    department: emp.Department || emp.department || '',
    position: emp.Position || emp.position || '',
    avatar: emp.Avatar || emp.avatar
  };
}
```

این تابع باید هر دو فرمت (PascalCase و camelCase) را پشتیبانی کند.

---

## 🧪 تست Dropdown ها

### تست 1: ClockInOut - Dropdown کارکنان

1. به صفحه **ثبت حضور** بروید
2. اگر admin/manager هستید، dropdown کارکنان را می‌بینید
3. Console را باز کنید (F12)
4. باید ببینید:
   ```
   📊 Loading employees...
   🌐 Fetching employees from API...
   📥 Raw employees from API: [...]
   ✅ Normalized employees: [...]
   ```
5. Dropdown باید لیست کارکنان را نشان دهد

### تست 2: Leaves - Dropdown کارکنان

1. به صفحه **مرخصی‌ها** بروید
2. روی **درخواست مرخصی** کلیک کنید
3. Modal باز می‌شود
4. Dropdown کارکنان را بررسی کنید
5. باید لیست کارکنان را نشان دهد

### تست 3: History - Dropdown کارکنان

1. به صفحه **سوابق** بروید
2. Dropdown فیلتر کارمند را بررسی کنید
3. باید "همه کارکنان" + لیست کارکنان را نشان دهد

### تست 4: UserManagement - Dropdown کارمند مرتبط

1. به **تنظیمات → مدیریت کاربران** بروید
2. روی **افزودن کاربر** کلیک کنید
3. Modal باز می‌شود
4. Dropdown "کارمند مرتبط" را بررسی کنید
5. باید لیست کارکنان را نشان دهد

---

## 🔍 عیب‌یابی پیشرفته

### بررسی 1: API Response

در Console browser اجرا کنید:

```javascript
// بررسی مستقیم API
fetch('http://localhost:3001/api/employees', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
  }
})
.then(r => r.json())
.then(data => {
  console.log('Raw API Response:', data);
  console.log('Number of employees:', data.length);
  if (data.length > 0) {
    console.log('First employee:', data[0]);
    console.log('Keys:', Object.keys(data[0]));
  }
});
```

**خروجی مورد انتظار:**
```javascript
Raw API Response: [
  { Id: "1", Name: "علی احمدی", PersonnelCode: "1001", Department: "فناوری اطلاعات", ... },
  ...
]
Number of employees: 8
First employee: { Id: "1", Name: "علی احمدی", ... }
Keys: ["Id", "Name", "PersonnelCode", "Department", "Position", ...]
```

### بررسی 2: Normalization

```javascript
// تست تابع normalize
const rawData = [
  { Id: "1", Name: "علی", PersonnelCode: "1001", Department: "IT" }
];

const normalized = rawData.map(emp => ({
  id: emp.Id || emp.id,
  name: emp.Name || emp.name || '',
  personnelCode: emp.PersonnelCode || emp.personnelCode || '',
  department: emp.Department || emp.department || '',
  position: emp.Position || emp.position || '',
  avatar: emp.Avatar || emp.avatar
}));

console.log('Normalized:', normalized);
```

**خروجی مورد انتظار:**
```javascript
Normalized: [
  { id: "1", name: "علی", personnelCode: "1001", department: "IT", position: "", avatar: undefined }
]
```

### بررسی 3: Cache

```javascript
// بررسی cache
const cache = JSON.parse(localStorage.getItem('attendance_cache'));
console.log('Cache:', cache);
console.log('Employees in cache:', cache.employees?.data?.length);
console.log('Cache timestamp:', new Date(cache.employees?.timestamp));
```

### بررسی 4: Local Storage

```javascript
// بررسی local storage
const localData = JSON.parse(localStorage.getItem('attendance_local_data'));
console.log('Local Data:', localData);
console.log('Employees in local storage:', localData.employees?.length);
```

---

## 🛠️ راه حل‌های سریع

### راه حل 1: پاک کردن Cache

```javascript
// در Console browser اجرا کنید:
localStorage.removeItem('attendance_cache');
location.reload();
```

### راه حل 2: پاک کردن همه داده‌ها

```javascript
// در Console browser اجرا کنید:
localStorage.clear();
location.reload();
```

### راه حل 3: Force Refresh

1. به صفحه مورد نظر بروید
2. روی دکمه **بارگذاری مجدد** کلیک کنید
3. Console را بررسی کنید

### راه حل 4: بررسی Backend

```bash
# در ترمینال سرور، لاگ‌ها را بررسی کنید:
[INFO] READ employees - Fetched 8 employees
```

اگر تعداد 0 است، مشکل از دیتابیس است.

---

## 📊 مشکلات خاص و راه حل‌ها

### مشکل: Dropdown کارکنان در ClockInOut خالی است

**علت احتمالی:**
- کاربر employee است و dropdown مخفی است
- یا داده‌ها بارگذاری نشده‌اند

**راه حل:**
1. بررسی کنید که با کاربر admin/manager وارد شده‌اید
2. Console را بررسی کنید
3. دکمه بارگذاری مجدد را کلیک کنید

### مشکل: Dropdown کارکنان در Leaves فقط نام را نشان می‌دهد

**علت:**
- کد قدیمی فقط `emp.name` را نمایش می‌داد

**راه حل:**
حالا همه dropdown ها فرمت کامل را نشان می‌دهند:
```
علی احمدی - 1001 (فناوری اطلاعات)
```

### مشکل: Dropdown نقش‌ها در UserManagement کار نمی‌کند

**علت:**
- نقش‌ها hardcoded هستند و از API نمی‌آیند

**راه حل:**
نیازی به تغییر نیست. نقش‌ها به صورت ثابت تعریف شده‌اند:
- admin: مدیر سیستم
- manager: مدیر بخش
- employee: کارمند

---

## 🎯 چک لیست عیب‌یابی

- [ ] Console browser را باز کنید (F12)
- [ ] لاگ‌های بارگذاری را بررسی کنید
- [ ] Network tab را بررسی کنید
- [ ] Status code درخواست‌ها را بررسی کنید
- [ ] Response داده‌ها را بررسی کنید
- [ ] Cache را بررسی کنید
- [ ] Local storage را بررسی کنید
- [ ] Console server را بررسی کنید
- [ ] دکمه بارگذاری مجدد را تست کنید
- [ ] پاک کردن cache را تست کنید

---

## 📝 فایل‌های تغییر یافته

### Dropdown های بهبود یافته:
- ✅ `src/components/ClockInOut.tsx` - Dropdown کارکنان
- ✅ `src/components/Leaves.tsx` - Dropdown کارکنان
- ✅ `src/components/History.tsx` - Dropdown فیلتر کارمند
- ✅ `src/components/UserManagement.tsx` - Dropdown کارمند مرتبط

### توابع جدید:
- ✅ `refreshEmployees()` - بارگذاری مجدد کارکنان
- ✅ `refreshRecords()` - بارگذاری مجدد سوابق
- ✅ `refreshLeaves()` - بارگذاری مجدد مرخصی‌ها
- ✅ `clearCache()` - پاک کردن کامل cache

### Logging:
- ✅ تمام توابع بارگذاری حالا لاگ‌های دقیق دارند
- ✅ بررسی داده‌های raw و normalized
- ✅ نمایش تعداد داده‌های بارگذاری شده

---

## 💡 نکات مهم

### 1. همیشه Console را باز نگه دارید
برای دیدن لاگ‌ها، همیشه Developer Tools (F12) را باز نگه دارید.

### 2. از دکمه بارگذاری مجدد استفاده کنید
اگر داده‌ها نمایش داده نمی‌شوند، اول دکمه بارگذاری مجدد را تست کنید.

### 3. Cache را پاک کنید
اگر مشکل حل نشد، cache را پاک کنید:
```javascript
localStorage.removeItem('attendance_cache');
location.reload();
```

### 4. Backend را بررسی کنید
اگر داده‌ها از API نمی‌آیند، Console server را بررسی کنید.

### 5. Network tab را بررسی کنید
اگر درخواست‌ها با خطا مواجه می‌شوند، Network tab را بررسی کنید.

---

**تاریخ:** 2024  
**وضعیت:** ✅ تمام dropdown ها بهبود یافتند  
**Build:** ✅ موفقیت‌آمیز
