# مدیریت حرکات تمرینی Yasnafit - 2707 حرکت

## خلاصه

این نسخه از Yasnafit شامل **2707 حرکت تمرینی** با دسته‌بندی کامل و پشتیبانی از عکس و ویدیو است، مشابه نسخه قدیمی Flutter (`mahdij64/yasna-fit`) اما با ساختار سبک Node.js + SQLite.

## ویژگی‌های پیاده‌سازی‌شده

### 1. دیتابیس کامل
- **17 دسته اصلی**: سینه (477)، سرشانه (719)، پا (511)، پشت (169)، جلو بازو (268)، پشت بازو (202)، شکم (252)، ساعد (35)، کول (20)، فیله کمر (19)، گردن (12)، هوازی (20)، گرم کردن (2)، سایر (1) و...
- **33 زیردسته**: بالا سینه، زیر سینه، سینه میانی، قفسه سینه، پرس سرشانه، فلای سرشانه، پرس پا، پشت پا، ساق پا، هاگ پا و...
- **2707 حرکت**: هر حرکت شامل نام فارسی، محل (باشگاه/منزل/هر دو)، دسته، زیردسته، وضعیت (اصلی/آرشیو)، اولویت، مسیر عکس و ویدیو

### 2. API کامل
- `GET /api/categories/grouped` - دسته‌ها با تعداد حرکات
- `GET /api/exercises?categoryId=chest&subCategoryId=chest-upper&location=gym&status=active&query=پرس&page=0&pageSize=24&sortBy=priority`
  - pagination: 24 حرکت در هر صفحه
  - search: جستجو در نام فارسی
  - filter: محل، زیردسته، وضعیت
  - sort: اولویت، نام، شناسه
- `POST /api/exercises` - افزودن حرکت جدید
- `PUT /api/exercises/:id` - ویرایش
- `DELETE /api/exercises/:id` - حذف تکی
- `POST /api/exercises/bulk-archive` - آرشیو گروهی
- `POST /api/exercises/bulk-restore` - بازیابی گروهی
- `DELETE /api/exercises/bulk-delete` - حذف گروهی
- `POST /api/exercises/import` - ایمپورت مجدد از JSON

### 3. رابط کاربری (UI) مشابه نسخه قدیمی Flutter

#### بخش‌های UI:
- **Toggle محل**: باشگاه / منزل / هر دو (مثل Flutter)
- **Dropdown دسته‌بندی**: با تعداد حرکات هر دسته (مثلاً سینه 477)
- **SubChips زیردسته**: همه، بالا سینه، زیر سینه، سینه میانی، قفسه سینه
- **Tabs وضعیت**: حرکات اصلی (1915) / حرکات آرشیو (792)
- **Search**: جستجوی زنده با debounce 400ms
- **Sort**: اولویت / نام / شناسه
- **Grid 2 ستونه**: هر کارت شامل:
  - تصویر 64x64 با fallback chain
  - نام فارسی
  - اطلاعات دسته و اولویت
  - دکمه ویرایش ✎
  - چک‌باکس سبز
- **Bulk Bar**: وقتی انتخاب داری، نوار سبز با تعداد انتخاب و دکمه‌های آرشیو/حذف
- **Pagination**: صفحه‌بندی با نمایش صفحه اول، آخر، قبلی، بعدی و تعداد کل
- **Select All**: انتخاب همه حرکات صفحه جاری

#### مدیریت عکس:
```js
// Fallback chain:
1. image_path از دیتابیس (/files/exercise/images/4.png)
2. /assets/images/exercises/imported/{original_id}.png
3. /assets/images/exercises/imported/{original_id}.jpg
4. /files/exercise/images/{id}.png
5. placeholder "تصویر موجود نیست"
```

### 4. لانچر (BAT) بهبودیافته
- گزینه 6 جدید: Import Exercise Images
  - به صورت خودکار از `C:\Users\MAHDI\Desktop\bodybuilding\exercises_organized` کپی می‌کند
  - به `public\assets\images\exercises\imported` 

## نحوه استفاده

### اجرای اولیه
```bat
# از طریق لانچر
YASNAFIT-LAUNCHER.bat -> 1. Start Server

# یا مستقیم
node server.js
# سپس http://localhost:3020
```

دیتابیس به صورت خودکار از `data-source/exercises_data.json` ساخته می‌شود:
```
Imported 2707 exercises from JSON (total now 2707)
Yasnafit is running at http://localhost:3020 with 2707 exercises
```

### مدیریت حرکات
1. از منوی کناری: **مدیریت حساب → مدیریت حرکات تمرینی**
2. یک دسته انتخاب کن (مثلاً سینه)
3. زیردسته را انتخاب کن (مثلاً بالا سینه)
4. جستجو کن (مثلاً "پرس")
5. حرکات را انتخاب و آرشیو/حذف گروهی کن
6. حرکت جدید اضافه کن

### اضافه کردن عکس‌ها
اگر 1888 عکس دسته‌بندی‌شده داری:

**روش 1 - از طریق لانچر:**
```
YASNAFIT-LAUNCHER.bat -> 6. Import Exercise Images
```

**روش 2 - دستی:**
```bat
xcopy /E /I "C:\Users\MAHDI\Desktop\bodybuilding\exercises_organized" "C:\Users\MAHDI\Desktop\yasnafit-git\public\assets\images\exercises\imported"
```

**روش 3 - Git:**
پوشه `public/assets/images/exercises/imported/` را به Git اضافه کن (فعلاً ignore نیست).

## تفاوت با نسخه قدیمی Flutter

| ویژگی | Flutter قدیمی | Yasnafit جدید |
|-------|--------------|--------------|
| تکنولوژی | Flutter + Hive | Node.js + SQLite + Vanilla JS |
| تعداد حرکات | ~27 + seed سینه | 2707 کامل |
| دسته‌بندی | 16 دسته با کاتالوگ | 17 دسته + 33 زیردسته |
| عکس | assets/images/exercises/ | public/assets/images/exercises/imported/ + fallback |
| pagination | 20 در صفحه | 24 در صفحه + صفحه‌بندی کامل |
| search | بله | بله با debounce |
| bulk action | آرشیو/حذف گروهی | آرشیو/بازیابی/حذف گروهی |
| محل | باشگاه/منزل | باشگاه/منزل/هر دو |
| وضعیت | active/archived | active/archived |

## ساختار فایل‌ها

```
yasnafit/
├── data-source/
│   └── exercises_data.json (2707 حرکت)
├── src/
│   └── database.js (seed + import 2707)
├── server.js (API + pagination + image serving)
├── public/
│   ├── exercises.js (UI کامل مدیریت حرکات)
│   ├── exercises.css (استایل حرفه‌ای)
│   ├── app.js / core.js (منو و داشبورد)
│   └── assets/images/exercises/
│       ├── README.md
│       └── imported/ (1888 عکس اینجا)
├── YASNAFIT-LAUNCHER.bat (با گزینه import images)
└── EXERCISE_MANAGEMENT.md (این فایل)
```

## API نمونه

```bash
# دسته‌ها
curl http://localhost:3020/api/categories/grouped

# سینه - بالا سینه - باشگاه - صفحه 0
curl "http://localhost:3020/api/exercises?categoryId=chest&subCategoryId=chest-upper&location=gym&status=active&page=0&pageSize=24"

# جستجوی پرس پا
curl "http://localhost:3020/api/exercises?categoryId=legs&query=پرس&page=0&pageSize=24"

# افزودن حرکت جدید
curl -X POST http://localhost:3020/api/exercises -H "Content-Type: application/json" -d '{"name_fa":"پرس سینه جدید","category_id":"chest","subcategory_id":"chest-mid","location":"gym","status":"active","priority":1}'
```

## TODO (پیشنهاد برای ادامه)

- [ ] آپلود مستقیم عکس از UI (multipart/form-data)
- [ ] ویرایش گروهی دسته/محل
- [ ] خروجی Excel از حرکات فیلترشده
- [ ] اتصال ویدیوها (mp4) با پخش در مودال
- [ ] افزودن فیلدهای بیشتر: تجهیزات، سختی، عضلات هدف، توضیحات
- [ ] جستجوی پیشرفته با چند دسته همزمان

---

ساخته شده با ❤️ برای مهدی - Yasnafit
