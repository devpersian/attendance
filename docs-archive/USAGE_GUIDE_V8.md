# 🚀 راهنمای استفاده از ویژگی‌های جدید - نسخه 8.0

## 📋 فهرست مطالب
1. [راه‌اندازی اولیه](#راه-اندازی-اولیه)
2. [سیستم لاگینگ پیشرفته](#سیستم-لاگینگ-پیشرفته)
3. [سیستم احراز هویت](#سیستم-احراز-هویت)
4. [مدیریت نقش‌ها و دسترسی‌ها](#مدیریت-نقش-ها-و-دسترسی-ها)
5. [API Reference](#api-reference)

---

## 🛠️ راه‌اندازی اولیه

### مرحله 1: به‌روزرسانی دیتابیس

```bash
# اتصال به SQL Server و اجرای اسکریپت جدید
sqlcmd -S localhost -U sa -P YourPassword123! -i database/schema.sql
```

**جداول جدید ایجاد شده:**
- `Roles` - نقش‌های کاربری
- `Permissions` - دسترسی‌های سیستم
- `RolePermissions` - ارتباط نقش و دسترسی
- `UserRoles` - ارتباط کاربر و نقش

### مرحله 2: Seed کاربر Admin

```bash
npm run seed:admin
```

**خروجی مورد انتظار:**
```
🔐 Seeding admin user...
✅ Admin user created successfully!
   Username: admin
   Password: admin123
   ⚠️  Please change the password after first login!
```

### مرحله 3: اجرای سرور Backend

```bash
npm run server
```

**خروجی مورد انتظار:**
```
📋 Configuration:
   Server Port: 3001
   Client Port: 3000
   Frontend URL: http://localhost:3000
🚀 Server running on port 3001
📊 API available at http://localhost:3001/api
✅ Database connection established
🔌 Device Service initialized
```

### مرحله 4: اجرای فرانت‌اند

```bash
npm run dev
```

**دسترسی به برنامه:**
- **URL**: http://localhost:3000
- **صفحه ورود**: http://localhost:3000/login

---

## 🔍 سیستم لاگینگ پیشرفته

### ویژگی‌ها

#### 1. لاگ‌های خودکار
- تمام درخواست‌های HTTP به صورت خودکار لاگ می‌شوند
- تمام عملیات CRUD لاگ می‌شوند
- تمام خطاها با stack trace کامل لاگ می‌شوند

#### 2. اطلاعات هر لاگ
```json
{
  "logId": "log-1234567890-abc123",
  "level": "info|success|warning|error",
  "action": "CREATE|UPDATE|DELETE|READ|LOGIN|...",
  "entity": "employee|record|leave|device|...",
  "entityId": "123",
  "message": "توضیحات عملیات",
  "metadata": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "environment": "development",
    "serverTime": "2024-01-15T10:30:00.000Z",
    "requestId": "req-1234567890-def456",
    "method": "POST",
    "url": "/api/employees",
    "statusCode": 201,
    "duration": "45ms",
    "ip": "192.168.1.100",
    "userAgent": "Mozilla/5.0..."
  },
  "userId": "user-123",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

#### 3. سطوح لاگ
- **info**: اطلاعات عمومی (درخواست‌های موفق)
- **success**: عملیات موفق (ایجاد، ویرایش، حذف)
- **warning**: هشدارها (درخواست‌های ناموفق، دسترسی غیرمجاز)
- **error**: خطاها (با stack trace کامل)

### نحوه مشاهده لاگ‌ها

#### از طریق پنل مدیریت:
1. وارد سیستم شوید
2. از منوی کناری، **تنظیمات → پنل مدیریت** را انتخاب کنید
3. تب **لاگ‌های سیستم** را انتخاب کنید
4. از فیلترها استفاده کنید:
   - **سطح**: info, success, warning, error
   - **موجودیت**: employee, record, leave, device, api
   - **تعداد**: 50, 100, 200, 500

#### از طریق API:
```bash
# دریافت تمام لاگ‌ها
curl http://localhost:3001/api/admin/logs

# فیلتر بر اساس سطح
curl "http://localhost:3001/api/admin/logs?level=error"

# فیلتر بر اساس موجودیت
curl "http://localhost:3001/api/admin/logs?entity=employee"

# محدود کردن تعداد
curl "http://localhost:3001/api/admin/logs?limit=100"
```

### آمار لاگ‌ها
```bash
curl http://localhost:3001/api/admin/logs/stats
```

**خروجی:**
```json
{
  "TotalLogs": 1234,
  "ErrorCount": 5,
  "WarningCount": 23,
  "SuccessCount": 890,
  "InfoCount": 316
}
```

### پاک‌سازی لاگ‌های قدیمی
```bash
# حذف لاگ‌های قدیمی‌تر از 30 روز
curl -X DELETE http://localhost:3001/api/admin/logs/clear
```

---

## 🔐 سیستم احراز هویت

### ورود به سیستم

#### از طریق UI:
1. به http://localhost:3000/login بروید
2. نام کاربری و رمز عبور را وارد کنید
3. روی **ورود به سیستم** کلیک کنید

#### از طریق API:
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

**پاسخ موفق:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "admin-1",
    "username": "admin",
    "email": "admin@company.com",
    "role": "admin"
  }
}
```

### استفاده از توکن

تمام درخواست‌های محافظت شده نیاز به توکن دارند:

```bash
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### اطلاعات کاربر فعلی
```bash
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**پاسخ:**
```json
{
  "id": "admin-1",
  "username": "admin",
  "email": "admin@company.com",
  "role": "admin",
  "isActive": true,
  "lastLogin": "2024-01-15T10:30:00.000Z",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### تغییر رمز عبور
```bash
curl -X PUT http://localhost:3001/api/auth/change-password \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "admin123",
    "newPassword": "newSecurePassword123"
  }'
```

### به‌روزرسانی پروفایل
```bash
curl -X PUT http://localhost:3001/api/auth/update-profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newemail@company.com"
  }'
```

### ایجاد کاربر جدید (فقط Admin)
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "password": "password123",
    "email": "newuser@company.com",
    "role": "employee"
  }'
```

---

## 👥 مدیریت نقش‌ها و دسترسی‌ها

### مشاهده تمام نقش‌ها
```bash
curl http://localhost:3001/api/roles \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE"
```

**پاسخ:**
```json
[
  {
    "Id": "role-admin",
    "Name": "مدیر سیستم",
    "Description": "دسترسی کامل به تمام بخش‌ها",
    "IsSystem": true,
    "UserCount": 1,
    "PermissionCount": 24
  },
  {
    "Id": "role-manager",
    "Name": "مدیر",
    "Description": "دسترسی به مدیریت کارکنان و گزارشات",
    "IsSystem": true,
    "UserCount": 0,
    "PermissionCount": 12
  }
]
```

### مشاهده جزئیات یک نقش
```bash
curl http://localhost:3001/api/roles/role-admin \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE"
```

**پاسخ:**
```json
{
  "Id": "role-admin",
  "Name": "مدیر سیستم",
  "Description": "دسترسی کامل به تمام بخش‌ها",
  "IsSystem": true,
  "permissions": [
    {
      "Id": "perm-dashboard-view",
      "Name": "مشاهده داشبورد",
      "Module": "dashboard",
      "Action": "view"
    },
    ...
  ]
}
```

### ایجاد نقش جدید
```bash
curl -X POST http://localhost:3001/api/roles \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "مدیر فروش",
    "description": "دسترسی به گزارشات فروش و مدیریت مشتریان"
  }'
```

### ویرایش نقش
```bash
curl -X PUT http://localhost:3001/api/roles/role-123 \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "مدیر فروش ارشد",
    "description": "دسترسی کامل به بخش فروش"
  }'
```

### حذف نقش
```bash
curl -X DELETE http://localhost:3001/api/roles/role-123 \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE"
```

**توجه:** نقش‌های سیستمی (IsSystem = true) قابل حذف نیستند.

### مشاهده تمام دسترسی‌ها
```bash
curl http://localhost:3001/api/permissions \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE"
```

**پاسخ (گروه‌بندی شده بر اساس ماژول):**
```json
{
  "dashboard": [
    {
      "Id": "perm-dashboard-view",
      "Name": "مشاهده داشبورد",
      "Module": "dashboard",
      "Action": "view"
    }
  ],
  "employees": [
    {
      "Id": "perm-employees-view",
      "Name": "مشاهده کارکنان",
      "Module": "employees",
      "Action": "view"
    },
    {
      "Id": "perm-employees-create",
      "Name": "ایجاد کارمند",
      "Module": "employees",
      "Action": "create"
    },
    ...
  ]
}
```

### به‌روزرسانی دسترسی‌های نقش
```bash
curl -X PUT http://localhost:3001/api/roles/role-123/permissions \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "permissionIds": [
      "perm-dashboard-view",
      "perm-employees-view",
      "perm-employees-create",
      "perm-reports-view"
    ]
  }'
```

### مشاهده نقش‌های یک کاربر
```bash
curl http://localhost:3001/api/user-roles/user-123 \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE"
```

**پاسخ:**
```json
[
  {
    "Id": "role-manager",
    "Name": "مدیر",
    "Description": "دسترسی به مدیریت کارکنان و گزارشات",
    "IsSystem": true
  }
]
```

### اختصاص نقش به کاربر
```bash
curl -X POST http://localhost:3001/api/user-roles/user-123/assign \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "roleId": "role-manager"
  }'
```

### لغو اختصاص نقش از کاربر
```bash
curl -X DELETE http://localhost:3001/api/user-roles/user-123/revoke/role-manager \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE"
```

### به‌روزرسانی تمام نقش‌های یک کاربر
```bash
curl -X PUT http://localhost:3001/api/user-roles/user-123 \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "roleIds": [
      "role-manager",
      "role-employee"
    ]
  }'
```

### مشاهده دسترسی‌های یک کاربر
```bash
curl http://localhost:3001/api/permissions/user/user-123 \
  -H "Authorization: Bearer USER_TOKEN_HERE"
```

**پاسخ:**
```json
{
  "permissions": [
    {
      "Id": "perm-dashboard-view",
      "Name": "مشاهده داشبورد",
      "Module": "dashboard",
      "Action": "view"
    },
    ...
  ],
  "isSuperAdmin": false
}
```

---

## 📚 API Reference

### احراز هویت
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/login` | ورود به سیستم | ❌ |
| POST | `/api/auth/register` | ثبت نام کاربر جدید | ✅ Admin |
| GET | `/api/auth/me` | اطلاعات کاربر فعلی | ✅ |
| PUT | `/api/auth/change-password` | تغییر رمز عبور | ✅ |
| PUT | `/api/auth/update-profile` | به‌روزرسانی پروفایل | ✅ |

### نقش‌ها
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/roles` | دریافت تمام نقش‌ها | ✅ Admin |
| GET | `/api/roles/:id` | دریافت جزئیات نقش | ✅ Admin |
| POST | `/api/roles` | ایجاد نقش جدید | ✅ Admin |
| PUT | `/api/roles/:id` | ویرایش نقش | ✅ Admin |
| DELETE | `/api/roles/:id` | حذف نقش | ✅ Admin |
| PUT | `/api/roles/:id/permissions` | به‌روزرسانی دسترسی‌های نقش | ✅ Admin |

### دسترسی‌ها
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/permissions` | دریافت تمام دسترسی‌ها | ✅ |
| GET | `/api/permissions/user/:userId` | دریافت دسترسی‌های کاربر | ✅ |
| PUT | `/api/permissions/user/:userId` | به‌روزرسانی دسترسی‌های کاربر | ✅ Admin |

### نقش‌های کاربر
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/user-roles/:userId` | دریافت نقش‌های کاربر | ✅ Admin |
| PUT | `/api/user-roles/:userId` | به‌روزرسانی نقش‌های کاربر | ✅ Admin |
| POST | `/api/user-roles/:userId/assign` | اختصاص نقش به کاربر | ✅ Admin |
| DELETE | `/api/user-roles/:userId/revoke/:roleId` | لغو اختصاص نقش | ✅ Admin |

---

## 🔒 نکات امنیتی

### توکن JWT
- اعتبار توکن: **24 ساعت**
- الگوریتم: **HS256**
- Secret Key: از متغیر محیطی `JWT_SECRET` خوانده می‌شود

### رمز عبور
- حداقل طول: **6 کاراکتر**
- رمزنگاری: **bcrypt** با 10 rounds
- ذخیره‌سازی: فقط hash در دیتابیس

### دسترسی‌ها
- نقش‌های سیستمی قابل حذف نیستند
- کاربر admin نمی‌تواند نقش‌های خود را تغییر دهد
- تمام عملیات حساس لاگ می‌شوند

### توصیه‌های امنیتی
1. ⚠️ **تغییر JWT_SECRET** در محیط production
2. ⚠️ **تغییر رمز عبور admin** پس از اولین ورود
3. ⚠️ **استفاده از HTTPS** در محیط production
4. ⚠️ **محدود کردن CORS** به دامنه‌های مجاز
5. ⚠️ **بررسی منظم لاگ‌ها** برای شناسایی فعالیت‌های مشکوک

---

## 🎯 سناریوهای کاربردی

### سناریو 1: ایجاد کاربر جدید با نقش سفارشی

```bash
# 1. ایجاد نقش جدید
curl -X POST http://localhost:3001/api/roles \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "حسابدار", "description": "دسترسی به گزارشات مالی"}'

# 2. اختصاص دسترسی‌ها به نقش
curl -X PUT http://localhost:3001/api/roles/role-new/permissions \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"permissionIds": ["perm-dashboard-view", "perm-reports-view"]}'

# 3. ایجاد کاربر جدید
curl -X POST http://localhost:3001/api/auth/register \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "accountant", "password": "pass123", "email": "acc@company.com", "role": "employee"}'

# 4. اختصاص نقش به کاربر
curl -X POST http://localhost:3001/api/user-roles/user-new/assign \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"roleId": "role-new"}'
```

### سناریو 2: بررسی لاگ‌های مشکوک

```bash
# 1. دریافت لاگ‌های خطا
curl "http://localhost:3001/api/admin/logs?level=error&limit=50" \
  -H "Authorization: Bearer ADMIN_TOKEN"

# 2. بررسی تلاش‌های ورود ناموفق
curl "http://localhost:3001/api/admin/logs?action=LOGIN_FAILED" \
  -H "Authorization: Bearer ADMIN_TOKEN"

# 3. بررسی فعالیت‌های یک کاربر خاص
curl "http://localhost:3001/api/admin/logs?userId=user-123" \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## 📞 پشتیبانی

در صورت بروز مشکل:
1. لاگ‌های سرور را بررسی کنید
2. از پنل مدیریت، لاگ‌های سیستم را مشاهده کنید
3. مستندات API را بررسی کنید
4. با تیم پشتیبانی تماس بگیرید

---

**نسخه**: 8.0  
**تاریخ**: 2024  
**وضعیت**: ✅ کامل و آماده استفاده
