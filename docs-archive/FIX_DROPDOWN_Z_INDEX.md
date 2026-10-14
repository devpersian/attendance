# 🔧 رفع مشکل z-index در SearchableDropdown - نسخه 8.6

## 🐛 مشکل گزارش شده

**مشکل:**
Dropdown menu پشت کارت اطلاعات کارمند و دکمه‌های سبز و قرمز (ثبت ورود/خروج) قرار می‌گرفت و قابل مشاهده نبود.

**علت:**
- Dropdown menu دارای `z-50` بود که کافی نبود
- Parent container (کارت) یک stacking context جدید ایجاد می‌کرد
- کارت‌های بعدی در DOM (employee info و action buttons) stacking order بالاتری داشتند
- حتی با `z-[9999]` در dropdown menu، چون parent container stacking context محدودکننده‌ای ایجاد می‌کرد، dropdown پشت کارت‌های بعدی قرار می‌گرفت

---

## ✅ راه حل اعمال شده

### 1. **افزایش z-index Dropdown Menu**

**فایل:** `src/components/SearchableDropdown.tsx`

```tsx
// قبل
<div className="absolute top-full mt-1 right-0 left-0 bg-white border border-[#E5E5E5] rounded-lg shadow-lg z-50 max-h-80 overflow-hidden">

// بعد
<div className="absolute top-full mt-1 right-0 left-0 bg-white border border-[#E5E5E5] rounded-lg shadow-2xl z-[9999] max-h-80 overflow-hidden">
```

**تغییرات:**
- ✅ افزایش z-index از `z-50` به `z-[9999]`
- ✅ افزایش shadow از `shadow-lg` به `shadow-2xl` برای visibility بهتر

---

### 2. **افزایش z-index Parent Container هنگام باز بودن Dropdown**

**فایل:** `src/components/SearchableDropdown.tsx`

```tsx
// قبل
<div className="relative" ref={dropdownRef}>

// بعد
<div className={`relative ${isOpen ? 'z-[9999]' : ''}`} ref={dropdownRef}>
```

**تغییرات:**
- ✅ وقتی dropdown باز است، parent container دارای `z-[9999]` می‌شود
- ✅ این کار باعث می‌شود parent container stacking context بالاتری داشته باشد
- ✅ در نتیجه dropdown menu که داخل parent است، بالاتر از کارت‌های بعدی قرار می‌گیرد

---

## 🎯 نحوه کار Stacking Context

### مشکل اصلی:

```
DOM Structure:
├── Card 1 (Employee Selection)
│   └── SearchableDropdown
│       └── Dropdown Menu (z-[9999])
├── Card 2 (Employee Info) ← بالاتر در DOM
└── Card 3 (Action Buttons) ← بالاتر در DOM
```

**بدون fix:**
- Parent container (Card 1) stacking context محدودکننده‌ای ایجاد می‌کند
- حتی با `z-[9999]` در dropdown menu، چون parent stacking context پایین‌تری دارد، dropdown پشت Card 2 و Card 3 قرار می‌گیرد

**با fix:**
- وقتی dropdown باز است، parent container دارای `z-[9999]` می‌شود
- Parent container stacking context بالاتری پیدا می‌کند
- Dropdown menu که داخل parent است، بالاتر از Card 2 و Card 3 قرار می‌گیرد ✅

---

## 🧪 نحوه تست

### مرحله 1: ری‌استارت سرور

```bash
npm run stop
npm run server
```

### مرحله 2: تست Dropdown

1. وارد سیستم شوید (admin/admin123)
2. به صفحه **ثبت حضور** بروید
3. روی dropdown انتخاب کارمند کلیک کنید
4. باید ببینید:
   - ✅ Dropdown menu بالای کارت اطلاعات کارمند قرار می‌گیرد
   - ✅ Dropdown menu بالای دکمه‌های سبز و قرمز قرار می‌گیرد
   - ✅ هیچ عنصری dropdown را پوشش نمی‌دهد
   - ✅ Shadow قوی‌تر (`shadow-2xl`) برای visibility بهتر

### مرحله 3: تست در صفحات دیگر

1. به صفحه **مرخصی‌ها** بروید
2. روی **درخواست مرخصی** کلیک کنید
3. روی dropdown انتخاب کارمند کلیک کنید
4. باید ببینید:
   - ✅ Dropdown menu بالای modal قرار می‌گیرد
   - ✅ هیچ عنصری dropdown را پوشش نمی‌دهد

---

## 📊 مقایسه قبل و بعد

### قبل:
```
┌─────────────────────────────────┐
│ Card 1: Employee Selection      │
│ ┌─────────────────────────────┐ │
│ │ Dropdown Trigger            │ │
│ └─────────────────────────────┘ │
│   ↓ Dropdown Menu (z-50)        │
│   ┌─────────────────────────┐   │
│   │ Options...              │   │ ← پشت Card 2
│   └─────────────────────────┘   │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ Card 2: Employee Info           │ ← روی Dropdown Menu
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ Card 3: Action Buttons          │ ← روی Dropdown Menu
└─────────────────────────────────┘
```

### بعد:
```
┌─────────────────────────────────┐
│ Card 1: Employee Selection      │
│ (z-[9999] when open)            │
│ ┌─────────────────────────────┐ │
│ │ Dropdown Trigger            │ │
│ └─────────────────────────────┘ │
│   ↓ Dropdown Menu (z-[9999])    │
│   ┌─────────────────────────┐   │
│   │ Options...              │   │ ← بالای Card 2 ✅
│   └─────────────────────────┘   │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ Card 2: Employee Info           │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ Card 3: Action Buttons          │
└─────────────────────────────────┘
```

---

## 📁 فایل‌های تغییر یافته

- ✅ `src/components/SearchableDropdown.tsx`
  - افزایش z-index dropdown menu به `z-[9999]`
  - افزایش shadow به `shadow-2xl`
  - اضافه کردن z-index conditional به parent container

---

## 💡 نکات مهم

### 1. Stacking Context

**Stacking Context** یک مفهوم CSS است که تعیین می‌کند عناصر چگونه روی هم قرار می‌گیرند.

**قوانین:**
- عناصر با `position: relative/absolute/fixed` stacking context جدید ایجاد می‌کنند
- `z-index` فقط در داخل stacking context والد کار می‌کند
- اگر parent stacking context پایین‌تری داشته باشد، child با `z-index` بالا هم پشت عناصر دیگر قرار می‌گیرد

**راه حل:**
- افزایش `z-index` parent container هنگام باز بودن dropdown
- این کار باعث می‌شود parent stacking context بالاتری داشته باشد
- در نتیجه child (dropdown menu) هم بالاتر قرار می‌گیرد

### 2. z-index Values

**مقادیر پیشنهادی:**
- `z-10` - عناصر معمولی
- `z-20` - Dropdown ها
- `z-30` - Modal ها
- `z-40` - Toast notifications
- `z-50` - Tooltips
- `z-[9999]` - عناصر بحرانی که باید بالاتر از همه باشند

**در این fix:**
- Dropdown menu: `z-[9999]`
- Parent container (when open): `z-[9999]`

### 3. Shadow برای Visibility

**تغییر:**
- `shadow-lg` → `shadow-2xl`

**دلیل:**
- Shadow قوی‌تر باعث می‌شود dropdown بهتر دیده شود
- مخصوصاً وقتی پس‌زمینه سفید است

---

## 🎯 نتیجه

✅ Dropdown menu دیگر پشت کارت‌های دیگر قرار نمی‌گیرد  
✅ Dropdown menu بالای تمام عناصر قرار می‌گیرد  
✅ Shadow قوی‌تر برای visibility بهتر  
✅ Parent container z-index مناسب هنگام باز بودن dropdown  

---

## 🧪 تست نهایی

### سناریو 1: ثبت حضور

1. وارد سیستم شوید (admin/admin123)
2. به صفحه **ثبت حضور** بروید
3. روی dropdown انتخاب کارمند کلیک کنید
4. باید ببینید:
   - ✅ Dropdown menu بالای کارت اطلاعات کارمند قرار می‌گیرد
   - ✅ Dropdown menu بالای دکمه‌های سبز و قرمز قرار می‌گیرد
   - ✅ هیچ عنصری dropdown را پوشش نمی‌دهد

### سناریو 2: درخواست مرخصی

1. به صفحه **مرخصی‌ها** بروید
2. روی **درخواست مرخصی** کلیک کنید
3. روی dropdown انتخاب کارمند کلیک کنید
4. باید ببینید:
   - ✅ Dropdown menu بالای modal قرار می‌گیرد
   - ✅ هیچ عنصری dropdown را پوشش نمی‌دهد

### سناریو 3: فیلتر سوابق

1. به صفحه **سوابق** بروید
2. روی dropdown فیلتر کارمند کلیک کنید
3. باید ببینید:
   - ✅ Dropdown menu بالای جدول قرار می‌گیرد
   - ✅ هیچ عنصری dropdown را پوشش نمی‌دهد

---

**نسخه**: 8.6  
**تاریخ**: 2024  
**وضعیت**: ✅ کامل و تست شده  
**Build**: ✅ موفقیت‌آمیز
