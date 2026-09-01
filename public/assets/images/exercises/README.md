# راهنمای تصاویر حرکات تمرینی

این پوشه برای نگهداری تصاویر 2707 حرکت تمرینی است.

## ساختار مورد انتظار

- `public/assets/images/exercises/imported/{id}.png` یا `.jpg`
- مثلاً: `imported/4.png` برای حرکت با `original_id=4`
- یا `imported/1741424043949.jpg` برای تصاویر با نام طولانی

## اگر 1888 عکس دسته‌بندی‌شده داری

پوشه `exercises_organized` که روی دسکتاپ داری (مسیر `C:\Users\MAHDI\Desktop\bodybuilding\exercises_organized`) را اینجا کپی کن:

1. در ویندوز، این دستور را اجرا کن:
```bat
xcopy /E /I "C:\Users\MAHDI\Desktop\bodybuilding\exercises_organized" "C:\Users\MAHDI\Desktop\yasnafit-git\public\assets\images\exercises\imported"
```

2. یا اگر از طریق لانچر می‌خوای، گزینه‌ای اضافه می‌شود که تصاویر را خودکار کپی می‌کند.

## اگر تصویر وجود نداشته باشد

سیستم به صورت خودکار:
1. ابتدا مسیر اصلی از دیتابیس (`/files/exercise/images/...`) را امتحان می‌کند
2. سپس `imported/{id}.png` و `imported/{id}.jpg`
3. در نهایت placeholder نمایش می‌دهد

پس حتی بدون عکس هم برنامه کامل کار می‌کند.
