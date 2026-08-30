(() => {
  'use strict';
  const labels={
    INVITED:'دعوت‌شده',PROFILE_INCOMPLETE:'پروفایل ناقص',ASSESSMENT_PENDING:'در حال تکمیل ارزیابی',
    DRAFT:'پیش‌نویس',SUBMITTED:'ارسال‌شده',PENDING_REVIEW:'در انتظار بررسی',UNDER_REVIEW:'در حال بررسی',
    CHANGES_REQUESTED:'نیاز به اصلاح',APPROVED:'تأییدشده',REJECTED:'ردشده',PROGRAM_ASSIGNED:'برنامه اختصاص داده شده',
    AWAITING_NEXT_ASSESSMENT:'در انتظار ارزیابی بعدی',ACTIVE:'فعال',COMPLETED:'تکمیل‌شده',ARCHIVED:'آرشیوشده',
    IN_PROGRESS:'در حال انجام',SKIPPED:'انجام‌نشده',INACTIVE:'غیرفعال',NEW:'جدید',
    REQUIRED:'الزامی',DUE:'موعد رسیده',NOT_DUE:'فعلاً نیاز نیست',WAITING_PROGRAM:'در انتظار برنامه',
    TEMPORARY:'رمز موقت',PERSONAL:'رمز شخصی',RESET_REQUIRED:'نیازمند بازنشانی',
    active:'فعال',used:'استفاده‌شده',expired:'منقضی‌شده',revoked:'لغوشده',
    INITIAL:'اولیه',MONTHLY:'ماهانه',
    low:'کم',medium:'متوسط',high:'زیاد',gym:'باشگاه',home:'منزل',
    iranian:'سفره ایرانی',professional:'رژیم حرفه‌ای',low_eating:'کم‌خوری',grazing:'ریزخوری',overeating:'پرخوری',emotional_overeating:'پرخوری عصبی',anorexia:'بی‌اشتهایی عصبی',
    none:'بدون مشکل',constipation:'یبوست',diarrhea:'اسهال',difficult_defecation:'دفع سخت',
    exercise:'تمرینی',diet:'غذایی',supplement:'مکمل',corrective:'اصلاحی',normal:'معمولی',REPEAT:'تکرار',TIME:'زمانی',FAILURE:'تا خستگی',AMRAP:'بیشترین تکرار',DROPSET:'دراپ‌ست',SUPERSET:'سوپرست',GIANT_SET:'جاینت‌ست',MINUTE:'دقیقه',REST_PAUSE:'استراحت‌ـ‌توقف',
    weight_loss:'کاهش وزن',weight_gain:'افزایش وزن',fitness:'فیتنس',maintenance:'تثبیت وزن',muscle_gain:'عضله‌سازی',fat_loss:'چربی‌سوزی',competition:'آمادگی مسابقه'
  };
  const text=value=>{const key=String(value??'').trim();return labels[key]||key||'—';};
  window.YasnafitLocale={labels,text,status:text,value:text,goal:text,assessmentType:text};
})();
