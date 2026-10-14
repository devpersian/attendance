# 🔧 اصلاح خطای emp.name is undefined

## 🐛 مشکل گزارش شده

```
Uncaught TypeError: can't access property "charAt", emp.name is undefined
    children Dashboard.tsx:162
```

## 🔍 علت مشکل

SQL Server نام ستون‌ها را با حروف بزرگ برمی‌گرداند (مانند `Name`, `Department`, `Id`) اما TypeScript interfaces انتظار حروف کوچک دارند (`name`, `department`, `id`).

### مثال:

**SQL Server Response:**
```json
{
  "Id": "1",
  "Name": "علی احمدی",
  "PersonnelCode": "1001",
  "Department": "فناوری اطلاعات",
  "Position": "توسعه‌دهنده"
}
```

**TypeScript Interface:**
```typescript
interface Employee {
  id: string;
  name: string;
  personnelCode: string;
  department: string;
  position: string;
}
```

**نتیجه:** `emp.name` undefined است چون داده واقعی در `emp.Name` قرار دارد!

## ✅ راه حل

### 1. ایجاد توابع Normalization

در فایل `src/utils/storage.ts`:

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

function normalizeRecord(record: any): AttendanceRecord {
  return {
    id: record.Id || record.id,
    employeeId: record.EmployeeId || record.employeeId,
    date: record.Date || record.date,
    clockIn: record.ClockIn || record.clockIn || null,
    clockOut: record.ClockOut || record.clockOut || null,
    status: record.Status || record.status,
    note: record.Note || record.note
  };
}

function normalizeLeave(leave: any): LeaveRequest {
  return {
    id: leave.Id || leave.id,
    employeeId: leave.EmployeeId || leave.employeeId,
    startDate: leave.StartDate || leave.startDate,
    endDate: leave.EndDate || leave.endDate,
    type: leave.Type || leave.type,
    status: leave.Status || leave.status,
    description: leave.Description || leave.description
  };
}
```

### 2. اعمال Normalization در تمام توابع Fetch

```typescript
// Employees
export async function getEmployees(): Promise<Employee[]> {
  try {
    const employees = await employeesAPI.getAll();
    const normalized = employees.map(normalizeEmployee); // ✅ نرمال‌سازی
    setCache('employees', normalized);
    return normalized;
  } catch (error) {
    // ...
  }
}

// Records
export async function getRecords(): Promise<AttendanceRecord[]> {
  try {
    const records = await recordsAPI.getAll();
    const normalized = records.map(normalizeRecord); // ✅ نرمال‌سازی
    setCache('records', normalized);
    return normalized;
  } catch (error) {
    // ...
  }
}

// Leaves
export async function getLeaves(): Promise<LeaveRequest[]> {
  try {
    const leaves = await leavesAPI.getAll();
    const normalized = leaves.map(normalizeLeave); // ✅ نرمال‌سازی
    setCache('leaves', normalized);
    return normalized;
  } catch (error) {
    // ...
  }
}
```

### 3. اضافه کردن Defensive Coding در کامپوننت‌ها

در فایل `src/components/Dashboard.tsx`:

```typescript
{employees.map((emp, idx) => {
  const empName = emp.name || 'نامشخص'; // ✅ مقدار پیش‌فرض
  const empDept = emp.department || 'نامشخص'; // ✅ مقدار پیش‌فرض
  return (
    <div key={emp.id}>
      <div>{empName.charAt(0)}</div>
      <p>{empName}</p>
      <p>{empDept}</p>
    </div>
  );
})}
```

در فایل `src/components/Employees.tsx`:

```typescript
{filteredEmployees.map((emp, idx) => {
  const empName = emp.name || 'نامشخص';
  const empCode = emp.personnelCode || 'نامشخص';
  const empPos = emp.position || 'نامشخص';
  const empDept = emp.department || 'نامشخص';
  return (
    <div key={emp.id}>
      <div>{getInitials(empName)}</div>
      <h4>{empName}</h4>
      <p>کد: {toPersianDigits(empCode)}</p>
      <span>{empPos}</span>
      <span>{empDept}</span>
    </div>
  );
})}
```

## 📊 مزایای این راه حل

### 1. **سازگاری با SQL Server**
- ✅ تبدیل خودکار نام ستون‌ها از PascalCase به camelCase
- ✅ پشتیبانی از هر دو فرمت (PascalCase و camelCase)

### 2. **جلوگیری از خطا**
- ✅ مقدار پیش‌فرض برای فیلدهای خالی
- ✅ جلوگیری از crash برنامه

### 3. **کد تمیزتر**
- ✅ یک بار normalization در سطح data layer
- ✅ کامپوننت‌ها نیازی به نگرانی درباره فرمت داده ندارند

### 4. **قابل نگهداری**
- ✅ تمام تبدیلات در یک مکان متمرکز
- ✅ آسان برای تغییر در آینده

## 🔧 فایل‌های تغییر یافته

### Backend
- `server/routes/employees.mjs` - لاگینگ اضافه شد
- `server/routes/records.mjs` - لاگینگ اضافه شد
- `server/routes/leaves.mjs` - لاگینگ اضافه شد
- `server/routes/devices.mjs` - لاگینگ اضافه شد

### Frontend
- `src/utils/storage.ts` - توابع normalization اضافه شد
- `src/components/Dashboard.tsx` - defensive coding اضافه شد
- `src/components/Employees.tsx` - defensive coding اضافه شد

## 🧪 تست

### قبل از اصلاح:
```
❌ Uncaught TypeError: can't access property "charAt", emp.name is undefined
❌ برنامه crash می‌کند
❌ هیچ داده‌ای نمایش داده نمی‌شود
```

### بعد از اصلاح:
```
✅ تمام کارکنان به درستی نمایش داده می‌شوند
✅ هیچ خطایی رخ نمی‌دهد
✅ داده‌های ناقص با "نامشخص" جایگزین می‌شوند
```

## 📝 نکات مهم

### برای توسعه‌دهندگان:

1. **همیشه از normalization استفاده کنید**
   - وقتی از SQL Server داده دریافت می‌کنید
   - وقتی API خارجی استفاده می‌کنید
   - وقتی فرمت داده ممکن است متفاوت باشد

2. **Defensive coding را فراموش نکنید**
   - همیشه مقدار پیش‌فرض برای فیلدهای اختیاری
   - استفاده از optional chaining (`?.`)
   - بررسی null/undefined قبل از استفاده

3. **TypeScript interfaces را به‌روز نگه دارید**
   - مطمئن شوید با فرمت داده واقعی مطابقت دارد
   - از type guards استفاده کنید

### برای SQL Server:

اگر می‌خواهید نام ستون‌ها را به camelCase تغییر دهید:

```sql
SELECT 
  Id as id,
  Name as name,
  PersonnelCode as personnelCode,
  Department as department,
  Position as position
FROM attendance.Employees
```

اما این روش توصیه نمی‌شود چون:
- ❌ نیاز به تغییر تمام کوئری‌ها
- ❌ ممکن است با کد موجود تداخل ایجاد کند
- ✅ بهتر است در frontend normalization انجام شود

## 🎯 نتیجه

✅ خطای `emp.name is undefined` برطرف شد  
✅ تمام کامپوننت‌ها به درستی کار می‌کنند  
✅ سازگاری کامل با SQL Server  
✅ کد مقاوم‌تر و قابل نگهداری‌تر  

---

**تاریخ اصلاح:** 2024  
**وضعیت:** ✅ کامل و تست شده
