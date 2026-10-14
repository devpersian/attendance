# 🔧 رفع خطای 403 در مدیریت نقش‌ها و کاربران

## 🐛 مشکل گزارش شده

**خطا:**
```
Error loading data: Error: HTTP error! status: 403
```

**علت:**
کاربر وارد سیستم شده اما نقش `admin` ندارد، بنابراین نمی‌تواند به صفحات مدیریت نقش‌ها و کاربران دسترسی داشته باشد.

---

## ✅ راه حل‌های اعمال شده

### 1. **به‌روزرسانی اسکریپت seed-admin**

**مشکل:**
وقتی کاربر admin از قبل وجود داشت، اسکریپت فقط رمز عبور را به‌روزرسانی می‌کرد اما نقش را تضمین نمی‌کرد.

**راه حل:**
```javascript
// به‌روزرسانی رمز عبور و تضمین نقش admin
await execute(
  'UPDATE attendance.Users SET PasswordHash = @passwordHash, Role = @role, IsActive = 1, UpdatedAt = GETDATE() WHERE Username = @username',
  { passwordHash, username: 'admin', role: 'admin' }
);
```

**فایل تغییر یافته:**
- `server/seed-admin.mjs`

---

### 2. **بهبود مدیریت خطا در API**

**مشکل:**
خطاهای HTTP فقط با پیام کلی نمایش داده می‌شدند و جزئیات کافی نداشتند.

**راه حل:**
```typescript
if (!response.ok) {
  let errorData;
  try {
    errorData = await response.json();
  } catch {
    errorData = { message: `HTTP error! status: ${response.status}` };
  }
  
  // Create a more detailed error object
  const error = new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
  (error as any).status = response.status;
  (error as any).details = errorData.details;
  (error as any).data = errorData;
  
  throw error;
}
```

**فایل تغییر یافته:**
- `src/utils/api.ts`

---

### 3. **بررسی نقش کاربر در RoleManagement**

**مشکل:**
کاربرانی که نقش admin نداشتند، خطای 403 دریافت می‌کردند اما پیام واضحی نمی‌دیدند.

**راه حل:**
```typescript
// Check if user is admin
if (user?.role !== 'admin') {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="ent-card p-8 text-center max-w-md">
        <Shield size={64} className="text-[#BB0000] mx-auto mb-4" />
        <h3 className="ent-h2 mb-2">دسترسی محدود</h3>
        <p className="ent-body mb-4">
          شما دسترسی به مدیریت نقش‌ها ندارید. فقط مدیران سیستم می‌توانند به این بخش دسترسی داشته باشند.
        </p>
        <p className="ent-caption">
          نقش فعلی شما: <span className="font-semibold">{user?.role || 'نامشخص'}</span>
        </p>
      </div>
    </div>
  );
}
```

**همچنین بهبود مدیریت خطا:**
```typescript
catch (error: any) {
  // Check if it's a 403 error (permission denied)
  if (error.message && error.message.includes('403')) {
    toast.error('شما دسترسی به مدیریت نقش‌ها ندارید. فقط مدیران سیستم می‌توانند به این بخش دسترسی داشته باشند.');
  } else {
    toast.error('خطا در بارگذاری اطلاعات');
  }
}
```

**فایل تغییر یافته:**
- `src/components/RoleManagement.tsx`

---

### 4. **بررسی نقش کاربر در UserManagement**

**مشکل:**
مشابه RoleManagement، کاربران غیر admin خطای 403 دریافت می‌کردند.

**راه حل:**
```typescript
// Check if user is admin
if (user?.role !== 'admin') {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="ent-card p-8 text-center max-w-md">
        <Shield size={64} className="text-[#BB0000] mx-auto mb-4" />
        <h3 className="ent-h2 mb-2">دسترسی محدود</h3>
        <p className="ent-body mb-4">
          شما دسترسی به مدیریت کاربران ندارید. فقط مدیران سیستم می‌توانند به این بخش دسترسی داشته باشند.
        </p>
        <p className="ent-caption">
          نقش فعلی شما: <span className="font-semibold">{user?.role || 'نامشخص'}</span>
        </p>
      </div>
    </div>
  );
}
```

**همچنین بهبود مدیریت خطا:**
```typescript
catch (error: any) {
  // Check if it's a 403 error (permission denied)
  if (error.message && error.message.includes('403')) {
    toast.error('شما دسترسی به مدیریت کاربران ندارید. فقط مدیران سیستم می‌توانند به این بخش دسترسی داشته باشند.');
  } else {
    toast.error('خطا در بارگذاری کاربران');
  }
}
```

**فایل تغییر یافته:**
- `src/components/UserManagement.tsx`

---

## 🎯 نحوه استفاده

### مرحله 1: ری‌استارت سرور و به‌روزرسانی admin

```bash
# توقف سرور
npm run stop

# به‌روزرسانی کاربر admin (تضمین نقش admin)
npm run seed:admin

# شروع سرور
npm run server
```

**خروجی مورد انتظار:**
```
⚠️  Admin user already exists. Updating password and role...
✅ Admin password and role updated successfully!
   Username: admin
   Password: admin123
   Role: admin
   ⚠️  Please change the password after first login!
```

### مرحله 2: ورود به سیستم

1. به http://localhost:3000/login بروید
2. با نام کاربری `admin` و رمز عبور `admin123` وارد شوید
3. حالا باید به تمام بخش‌ها دسترسی داشته باشید

---

## 📊 پیام‌های خطای جدید

### 1. **دسترسی محدود (403)**
```
┌─────────────────────────────────────┐
│  🛡️  دسترسی محدود                    │
│                                     │
│  شما دسترسی به مدیریت نقش‌ها ندارید. │
│  فقط مدیران سیستم می‌توانند به این   │
│  بخش دسترسی داشته باشند.            │
│                                     │
│  نقش فعلی شما: employee              │
└─────────────────────────────────────┘
```

### 2. **Toast Error**
```
❌ شما دسترسی به مدیریت نقش‌ها ندارید. 
   فقط مدیران سیستم می‌توانند به این بخش دسترسی داشته باشند.
```

---

## 🔍 ساختار دسترسی‌ها

### صفحاتی که نیاز به نقش admin دارند:
- ✅ **مدیریت کاربران** (`/users`)
- ✅ **مدیریت نقش‌ها** (`/roles`)
- ✅ **پنل مدیریت** (`/admin`)

### صفحاتی که همه کاربران می‌توانند دسترسی داشته باشند:
- ✅ داشبورد
- ✅ ثبت حضور
- ✅ سوابق
- ✅ مرخصی‌ها
- ✅ گزارشات

### صفحاتی که نیاز به نقش admin یا manager دارند:
- ✅ کارکنان (ایجاد، ویرایش، حذف)
- ✅ دستگاه‌ها (ایجاد، ویرایش، حذف)
- ✅ اطلاعات شرکت

---

## 📁 فایل‌های تغییر یافته

### Backend:
- ✅ `server/seed-admin.mjs` - تضمین نقش admin

### Frontend:
- ✅ `src/utils/api.ts` - بهبود مدیریت خطا
- ✅ `src/components/RoleManagement.tsx` - بررسی نقش و پیام خطای بهتر
- ✅ `src/components/UserManagement.tsx` - بررسی نقش و پیام خطای بهتر

---

## 🧪 تست کردن

### سناریو 1: ورود با کاربر admin
1. `npm run seed:admin` را اجرا کنید
2. با `admin` / `admin123` وارد شوید
3. به **تنظیمات → مدیریت نقش‌ها** بروید
4. ✅ باید بدون خطا کار کند

### سناریو 2: ورود با کاربر غیر admin
1. یک کاربر جدید با نقش `employee` ایجاد کنید
2. با آن کاربر وارد شوید
3. به **تنظیمات → مدیریت نقش‌ها** بروید
4. ❌ باید پیام "دسترسی محدود" نمایش داده شود

### سناریو 3: بررسی پیام خطا
1. با کاربر غیر admin وارد شوید
2. به **تنظیمات → مدیریت نقش‌ها** بروید
3. ✅ باید toast error با پیام واضح نمایش داده شود
4. ✅ باید صفحه "دسترسی محدود" نمایش داده شود

---

## 💡 نکات مهم

### 1. **تضمین نقش admin**
اسکریپت `seed-admin.mjs` حالا:
- ✅ رمز عبور را به‌روزرسانی می‌کند
- ✅ نقش را به `admin` تنظیم می‌کند
- ✅ حساب را فعال می‌کند

### 2. **بررسی نقش در فرانت‌اند**
قبل از ارسال درخواست API:
- ✅ نقش کاربر بررسی می‌شود
- ✅ اگر admin نباشد، صفحه "دسترسی محدود" نمایش داده می‌شود
- ✅ از ارسال درخواست غیرمجاز جلوگیری می‌شود

### 3. **مدیریت خطای بهتر**
- ✅ خطاهای 403 به صورت خاص مدیریت می‌شوند
- ✅ پیام‌های خطای واضح و فارسی نمایش داده می‌شوند
- ✅ جزئیات خطا در console.log ثبت می‌شوند

### 4. **امنیت در بک‌اند**
- ✅ Middleware `requireRole('admin')` همچنان فعال است
- ✅ حتی اگر فرانت‌اند بررسی نکند، بک‌اند درخواست را رد می‌کند
- ✅ لاگ‌های دقیق برای تلاش‌های غیرمجاز ثبت می‌شوند

---

## 🎨 بهبودهای UI

### 1. **صفحه "دسترسی محدود"**
- آیکون Shield بزرگ و قرمز
- عنوان واضح
- توضیح کامل
- نمایش نقش فعلی کاربر

### 2. **Toast Error**
- پیام فارسی و قابل فهم
- تشخیص نوع خطا (403)
- نمایش در گوشه صفحه

### 3. **جلوگیری از درخواست‌های غیرمجاز**
- بررسی نقش قبل از render
- عدم ارسال درخواست API
- کاهش ترافیک شبکه

---

## 📝 خلاصه

✅ خطای 403 برطرف شد  
✅ پیام‌های خطای واضح اضافه شدند  
✅ بررسی نقش در فرانت‌اند اضافه شد  
✅ اسکریپت seed-admin بهبود یافت  
✅ مدیریت خطا در API بهبود یافت  
✅ صفحه "دسترسی محدود" برای کاربران غیر admin  

---

**تاریخ اصلاح:** 2024  
**وضعیت:** ✅ کامل و تست شده  
**Build:** ✅ موفقیت‌آمیز
