/**
 * Yasnafit — Professional Workout Program PDF & Print Engine
 * Compatible with Coach Panel, Student Panel, and Program Builder
 */
(() => {
  'use strict';

  const win = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const muscleNames = {
    front_deltoid_anterior: 'سرشانه جلو',
    front_deltoid_lateral: 'سرشانه میانی',
    front_chest: 'سینه',
    front_biceps: 'جلو بازو',
    front_brachialis: 'براکیالیس',
    front_brachioradialis: 'ساعد',
    front_rectus_abdominis: 'راست شکمی',
    front_obliques: 'مورب شکمی (پهلو)',
    front_serratus_anterior: 'دندانه‌ای',
    front_quadriceps: 'چهارسر ران',
    front_iliopsoas: 'عضلات ران',
    back_trapezius: 'کول (ذوزنقه‌ای)',
    back_latissimus_dorsi: 'زیربغل',
    back_triceps: 'پشت بازو',
    back_teres_major: 'گرد بزرگ',
    back_teres_minor: 'گرد کوچک',
    back_infraspinatus: 'تحت‌خاری',
    back_gluteus_maximus: 'باسن (سرینی)',
    back_hamstrings: 'همسترینگ',
    back_gastrocnemius: 'ساق پا',
    back_soleus: 'نعلی ساق'
  };

  const systems = {
    1: { label: 'معمولی', icon: '📌' },
    2: { label: 'سوپر ست (Superset)', icon: '⚡' },
    3: { label: 'تری ست (Triset)', icon: '🔺' },
    4: { label: 'جاینت ست (Giant Set)', icon: '🔥' },
    5: { label: 'دراپ ست (Drop Set)', icon: '💧' },
    6: { label: 'هرمی (Pyramid)', icon: '🏛️' },
    7: { label: 'هرمی معکوس (Reverse Pyramid)', icon: '🔻' },
    8: { label: 'استراحت-توقف (Rest-Pause)', icon: '⏸️' },
    9: { label: 'سیستم ۲۱ (Twenty-One)', icon: '🔢' },
    10: { label: 'تکرار نیمه (Partial Reps)', icon: '✂️' },
    11: { label: 'نردبانی ۲۰-۱۰-۵ (Ladder)', icon: '🪜' },
    12: { label: 'ماموت ست (Mammoth Set)', icon: '🦣' }
  };

  const units = {
    REPEAT: 'تکرار',
    TIME: 'ثانیه',
    SECONDS: 'ثانیه',
    MINUTE: 'دقیقه',
    DROPSET: 'دراپ',
    FAILURE: 'توان'
  };

  function toFaDate(isoStr) {
    if (!isoStr) return '—';
    const jService = win.YasnaJalali || (typeof YasnaJalali !== 'undefined' ? YasnaJalali : null);
    if (jService && typeof jService.isoToJalaliStr === 'function') {
      const j = jService.isoToJalaliStr(isoStr);
      if (j) return j;
    }
    try {
      const d = new Date(isoStr.includes('T') ? isoStr : `${isoStr}T00:00:00`);
      return d.toLocaleDateString('fa-IR');
    } catch(e) {
      return isoStr;
    }
  }

  function getTodayFaDate() {
    try {
      return new Date().toLocaleDateString('fa-IR');
    } catch(e) {
      return '—';
    }
  }

  function resolveMusclesLabel(muscles) {
    if (!muscles || !Array.isArray(muscles) || muscles.length === 0) return '';
    const names = muscles.map(m => muscleNames[m] || m).filter(Boolean);
    return names.join('، ');
  }

  function renderSetsHTML(sets) {
    return (sets || []).map((st, sIdx) => {
      const isFailure = st.type === 'FAILURE';
      const unitName = units[st.type] || 'تکرار';
      const val = isFailure ? 'MAX' : (st.count ?? st.count_value ?? '—');
      return `
        <div class="pdf-set-sq" title="ست ${(sIdx + 1).toLocaleString('fa-IR')}">
          <span class="pdf-set-val">${esc(String(val))}</span>
          <span class="pdf-set-unit">${unitName}</span>
        </div>
      `;
    }).join('');
  }

  function generateProgramSheetHTML(program) {
    const progData = program.program_data || {};
    const days = progData.days || [];
    const studentName = program.student_name || program.studentName || 'ورزشکار گرامی';
    const caseNumber = program.student_case_number || program.studentCaseNumber || program.case_number || '—';
    const startDate = toFaDate(program.start_date || program.startDate);
    const endDate = toFaDate(program.end_date || program.endDate);
    const title = program.title || 'برنامه تمرینی تخصصی بدنسازی';
    const coachNote = program.coach_note || program.coachNote || '';
    const statusLabel = program.status === 'ACTIVE' ? 'فعال' : (program.status === 'DRAFT' ? 'پیش‌نویس' : (program.status === 'COMPLETED' ? 'تکمیل‌شده' : (program.status || 'اختصاصی')));
    const today = getTodayFaDate();

    let totalMovements = 0;
    let totalSets = 0;
    days.forEach(d => {
      (d.data || d.systems || []).forEach(s => {
        const movs = s.movement_list || s.movements || [];
        totalMovements += movs.length;
        movs.forEach(m => {
          totalSets += (m.sets || []).length;
        });
      });
    });

    const daysHTML = days.map((day, dIdx) => {
      const dayNum = day.day_number || (dIdx + 1);
      const dayFocus = day.focus ? esc(day.focus) : `جلسه ${dayNum.toLocaleString('fa-IR')}`;
      const isRest = Boolean(day.is_rest_day || day.isRestDay);
      const dayNote = day.coach_note || day.coachNote || '';
      const daySystems = day.data || day.systems || [];

      if (isRest) {
        return `
          <section class="pdf-day-card">
            <header class="pdf-day-head">
              <h3>روز ${dayNum.toLocaleString('fa-IR')} — ${dayFocus}</h3>
              <span class="pdf-day-meta">🛌 استراحت و ریکاوری فعال</span>
            </header>
            ${dayNote ? `<div class="pdf-day-coach-note"><b>یادداشت مربی:</b> ${esc(dayNote)}</div>` : ''}
            <div class="pdf-rest-box">
              <b>روز استراحت و ریکاوری فعال</b>
              <span>استراحت کافی، خواب باکیفیت شبانه (۷ الی ۸ ساعت)، مصرف مداوم آب و تغذیه متناسب جهت رشد و بازسازی تارهای عضلانی.</span>
            </div>
          </section>
        `;
      }

      let dayMovCount = 0;
      daySystems.forEach(s => {
        dayMovCount += (s.movement_list || s.movements || []).length;
      });

      let movCounter = 1;

      const systemsHTML = daySystems.map(sys => {
        const sysId = Number(sys.exercise_system_id || sys.exerciseSystemId || 1);
        const sysMeta = systems[sysId] || systems[1];
        const movs = sys.movement_list || sys.movements || [];

        if (movs.length === 0) return '';

        // CASE 1: Linked Multi-Movement Group (Superset, Triset, Giant Set, etc.)
        if (movs.length > 1 && sysId !== 1) {
          const comboRowsHTML = movs.map((mov) => {
            const mNum = movCounter++;
            const movName = mov.nameFa || mov.name || 'حرکت تمرینی';
            const movDesc = mov.description || '';
            const targetMusclesStr = resolveMusclesLabel(mov.target_muscles);
            const imgSrc = (mov.image_path && mov.image_path.trim())
              ? mov.image_path
<<<<<<< HEAD
              : (mov.original_exercise_id ? `/api/exercise-image/${mov.original_exercise_id}` : '/assets/images/blank-white.svg');
=======
              : (mov.original_exercise_id ? `/api/exercise-image/${mov.original_exercise_id}` : '/blank-white.svg');
>>>>>>> 025511f (fix: resolve blank image flickering with robust fallback and fix program deletion in bank)
            const setsHTML = renderSetsHTML(mov.sets);

            return `
              <div class="pdf-combo-row">
                <div class="pdf-mov-img">
<<<<<<< HEAD
                  <img src="${esc(imgSrc)}" alt="" onerror="this.src='/assets/images/blank-white.svg'" loading="lazy">
=======
                  <img src="${esc(imgSrc)}" alt="" onerror="this.onerror=null; this.src='/blank-white.svg';" loading="lazy">
>>>>>>> 025511f (fix: resolve blank image flickering with robust fallback and fix program deletion in bank)
                </div>
                <div class="pdf-mov-info">
                  <div class="pdf-mov-name-row">
                    <span class="pdf-mov-name">${mNum.toLocaleString('fa-IR')}. ${esc(movName)}</span>
                    ${targetMusclesStr ? `<span class="pdf-muscles-tag">${esc(targetMusclesStr)}</span>` : ''}
                  </div>
                  ${movDesc ? `<p class="pdf-mov-desc">📌 ${esc(movDesc)}</p>` : ''}
                </div>
                <div class="pdf-set-boxes">
                  ${setsHTML}
                </div>
              </div>
            `;
          }).join('');

          let comboHint = 'حرکات متوالی بدون استراحت بین ست‌ها';
          if (sysId === 2) comboHint = '۲ حرکت پی‌درپی بدون استراحت';
          else if (sysId === 3) comboHint = '۳ حرکت پی‌درپی بدون استراحت';
          else if (sysId === 4) comboHint = '۴ حرکت پی‌درپی بدون استراحت';

          return `
            <div class="pdf-combo-group">
              <div class="pdf-combo-head">
                <span class="pdf-combo-title">${sysMeta.icon} سیستم: ${esc(sysMeta.label)}</span>
                <span class="pdf-combo-hint">⚡ ${comboHint}</span>
              </div>
              <div class="pdf-combo-items">
                ${comboRowsHTML}
              </div>
            </div>
          `;
        }

        // CASE 2: Single-movement rows (Normal, Dropset, Warmup, Cardio, Cooldown, etc.)
        return movs.map(mov => {
          const mNum = movCounter++;
          const movName = mov.nameFa || mov.name || 'حرکت تمرینی';
          const movDesc = mov.description || '';
          const targetMusclesStr = resolveMusclesLabel(mov.target_muscles);
          const imgSrc = (mov.image_path && mov.image_path.trim())
            ? mov.image_path
<<<<<<< HEAD
            : (mov.original_exercise_id ? `/api/exercise-image/${mov.original_exercise_id}` : '/assets/images/blank-white.svg');
=======
            : (mov.original_exercise_id ? `/api/exercise-image/${mov.original_exercise_id}` : '/blank-white.svg');
>>>>>>> 025511f (fix: resolve blank image flickering with robust fallback and fix program deletion in bank)

          let inlineSystemTag = '';
          if (sysId === 5) inlineSystemTag = '<span class="pdf-system-inline-pill">💧 دراپ‌ست</span>';
          else if (sysId === 6) inlineSystemTag = '<span class="pdf-system-inline-pill">🏛️ هرمی</span>';
          else if (sysId === 8) inlineSystemTag = '<span class="pdf-system-inline-pill">⏸️ رست‌پاز</span>';
          else if (sysId === 9) inlineSystemTag = '<span class="pdf-system-inline-pill">🔢 ۲۱</span>';
          else if (sysId === 10) inlineSystemTag = '<span class="pdf-system-inline-pill">✂️ تکرار نیمه</span>';
          else if (movName.includes('گرم کردن')) inlineSystemTag = '<span class="pdf-system-inline-pill">🏃 گرم‌کردن</span>';
          else if (movName.includes('سرد کردن')) inlineSystemTag = '<span class="pdf-system-inline-pill">🧘 سردکردن</span>';
          else if (movName.includes('تردمیل') || movName.includes('دوچرخه') || movName.includes('الپتیکال')) inlineSystemTag = '<span class="pdf-system-inline-pill">🚴 هوازی</span>';
          else inlineSystemTag = '<span class="pdf-system-inline-pill">معمولی</span>';

          const setsHTML = renderSetsHTML(mov.sets);

          return `
            <div class="pdf-mov-row">
              <div class="pdf-mov-img">
<<<<<<< HEAD
                <img src="${esc(imgSrc)}" alt="" onerror="this.src='/assets/images/blank-white.svg'" loading="lazy">
=======
                <img src="${esc(imgSrc)}" alt="" onerror="this.onerror=null; this.src='/blank-white.svg';" loading="lazy">
>>>>>>> 025511f (fix: resolve blank image flickering with robust fallback and fix program deletion in bank)
              </div>
              <div class="pdf-mov-info">
                <div class="pdf-mov-name-row">
                  <span class="pdf-mov-name">${mNum.toLocaleString('fa-IR')}. ${esc(movName)}</span>
                  ${inlineSystemTag}
                  ${targetMusclesStr ? `<span class="pdf-muscles-tag">${esc(targetMusclesStr)}</span>` : ''}
                </div>
                ${movDesc ? `<p class="pdf-mov-desc">📌 ${esc(movDesc)}</p>` : ''}
              </div>
              <div class="pdf-set-boxes">
                ${setsHTML}
              </div>
            </div>
          `;
        }).join('');
      }).join('');

      return `
        <section class="pdf-day-card">
          <header class="pdf-day-head">
            <h3>روز ${dayNum.toLocaleString('fa-IR')} — ${dayFocus}</h3>
            <span class="pdf-day-meta">${daySystems.length.toLocaleString('fa-IR')} سیستم تمرینی • ${dayMovCount.toLocaleString('fa-IR')} حرکت</span>
          </header>
          ${dayNote ? `<div class="pdf-day-coach-note"><b>یادداشت مربی برای این روز:</b> ${esc(dayNote)}</div>` : ''}
          <div class="pdf-day-body">
            ${systemsHTML}
          </div>
        </section>
      `;
    }).join('');

    return `
      <div class="pdf-sheet">
        <!-- Header -->
        <header class="pdf-header">
          <div class="pdf-brand-bar">
            <div class="pdf-logo-group">
              <div class="pdf-logo-badge">Y</div>
              <div>
                <h2 class="pdf-brand-title">سامانه مدیریت و مربیگری یسنافیت</h2>
                <div class="pdf-brand-subtitle">Yasnafit Professional Coaching & Fitness Platform</div>
              </div>
            </div>
            <div class="pdf-stamp-badge">
              نسخه چاپی رسمی • ${today}
            </div>
          </div>

          <h1 class="pdf-program-title">${esc(title)}</h1>

          <div class="pdf-meta-grid">
            <div class="pdf-meta-item">
              <span class="pdf-meta-label">نام و نام خانوادگی ورزشکار</span>
              <span class="pdf-meta-val">${esc(studentName)}</span>
            </div>
            <div class="pdf-meta-item">
              <span class="pdf-meta-label">شماره پرونده</span>
              <span class="pdf-meta-val" dir="ltr" style="text-align:right">${esc(caseNumber)}</span>
            </div>
            <div class="pdf-meta-item">
              <span class="pdf-meta-label">دوره اجرای برنامه (جلالی)</span>
              <span class="pdf-meta-val">${startDate} تا ${endDate}</span>
            </div>
            <div class="pdf-meta-item">
              <span class="pdf-meta-label">آمار جلسات و ست‌ها</span>
              <span class="pdf-meta-val">${days.length.toLocaleString('fa-IR')} جلسه • ${totalMovements.toLocaleString('fa-IR')} حرکت (${totalSets.toLocaleString('fa-IR')} ست)</span>
            </div>
            <div class="pdf-meta-item">
              <span class="pdf-meta-label">وضعیت برنامه</span>
              <span class="pdf-meta-val">${esc(statusLabel)}</span>
            </div>
          </div>

          ${coachNote ? `
            <div class="pdf-coach-note">
              <b>توصیه‌های اختصاصی مربی:</b> ${esc(coachNote)}
            </div>
          ` : ''}

          <div class="pdf-guidelines-box">
            <div class="pdf-guidelines-head">
              <span>📋</span>
              <b>پروتکل‌های عمومی اجرای برنامه و ریکاوری:</b>
            </div>
            <div class="pdf-guidelines-grid">
              <div class="pdf-guide-item">
                <b>🏃 گرم‌کردن و موبیلیتی:</b>
                <span>۵ الی ۱۰ دقیقه گرم‌کردن عمومی + ۱ تا ۲ ست سبک فعال‌سازی عصبی عضلانی.</span>
              </div>
              <div class="pdf-guide-item">
                <b>⏱️ استراحت بین ست‌ها:</b>
                <span>۶۰ تا ۹۰ ثانیه برای حرکات ایزوله و ۹۰ تا ۱۲۰ ثانیه برای حرکات کامپاند.</span>
              </div>
              <div class="pdf-guide-item">
                <b>🎯 تمپو و کنترل وزنه:</b>
                <span>تمرکز بر فاز منفی (اکسنتریک)، حفظ فرم صحیح و دامنه کامل حرکتی بدون ضربه.</span>
              </div>
              <div class="pdf-guide-item">
                <b>💧 آب‌رسانی و تغذیه:</b>
                <span>مصرف آب کافی حین تمرین و مصرف پروتئین و کربوهیدرات مناسب پس از جلسه.</span>
              </div>
            </div>
          </div>
        </header>

        <!-- Body / Days -->
        <main class="pdf-body">
          ${daysHTML || '<div style="text-align:center;padding:32px;color:var(--pdf-text-muted)">روز تمرینی در این برنامه ثبت نشده است.</div>'}
        </main>

        <!-- Footer -->
        <footer class="pdf-footer">
          <span>طراحی و تنظیم در سامانه هوشمند بدنسازی و مربیگری یسنافیت (Yasnafit)</span>
          <span>برنامه تمرینی اختصاصی • غیرقابل انتقال به غیر</span>
          <span>تاریخ صدور: ${today}</span>
        </footer>
      </div>
    `;
  }

  function programToPlainText(program) {
    const progData = program.program_data || {};
    const days = progData.days || [];
    const studentName = program.student_name || program.studentName || 'ورزشکار';
    const startDate = toFaDate(program.start_date || program.startDate);
    const endDate = toFaDate(program.end_date || program.endDate);
    const title = program.title || 'برنامه تمرینی';

    let text = `🏋️ ${title}\n👤 ورزشکار: ${studentName}\n🗓️ بازه: ${startDate} تا ${endDate}\n`;
    if (program.coach_note) text += `💬 یادداشت مربی: ${program.coach_note}\n`;
    text += `\n${'═'.repeat(30)}\n`;

    days.forEach((day, dIdx) => {
      const dayNum = day.day_number || (dIdx + 1);
      const dayFocus = day.focus || `جلسه ${dayNum}`;
      if (day.is_rest_day || day.isRestDay) {
        text += `\n🛌 روز ${dayNum}: ${dayFocus} (استراحت و ریکاوری)\n`;
      } else {
        text += `\n📌 روز ${dayNum}: ${dayFocus}\n`;
        let movCounter = 1;
        (day.data || day.systems || []).forEach(sys => {
          const sysId = Number(sys.exercise_system_id || sys.exerciseSystemId || 1);
          const sysMeta = systems[sysId] || systems[1];
          const movs = sys.movement_list || sys.movements || [];

          if (movs.length > 1 && sysId !== 1) {
            text += `\n  ⚡ [ ${sysMeta.label} ]:\n`;
            movs.forEach((mov) => {
              const movName = mov.nameFa || mov.name || 'حرکت';
              const setsStr = (mov.sets || []).map((s) => `${s.count || '—'} ${units[s.type] || 'تکرار'}`).join(' | ');
              text += `    ${movCounter++}. ${movName} ← [ ${setsStr} ]\n`;
              if (mov.description) text += `       نکته: ${mov.description}\n`;
            });
          } else {
            movs.forEach((mov) => {
              const movName = mov.nameFa || mov.name || 'حرکت';
              const setsStr = (mov.sets || []).map((s) => `${s.count || '—'} ${units[s.type] || 'تکرار'}`).join(' | ');
              const sysTag = sysId !== 1 ? ` (${sysMeta.label})` : ' (معمولی)';
              text += `  ${movCounter++}. ${movName}${sysTag} ← [ ${setsStr} ]\n`;
              if (mov.description) text += `     نکته: ${mov.description}\n`;
            });
          }
        });
      }
    });

    text += `\n${'═'.repeat(30)}\nتنظیم شده در سامانه یسنافیت (Yasnafit)`;
    return text;
  }

  async function openProgramPDF(programOrId) {
    let program = null;

    if (typeof programOrId === 'number' || typeof programOrId === 'string') {
      try {
        const id = Number(programOrId);
        try {
          const res = await fetch(`/api/training-programs/${id}/full`);
          if (res.ok) {
            program = await res.json();
          }
        } catch(e) {}

        if (!program) {
          try {
            const sRes = await fetch('/api/student/program');
            if (sRes.ok) {
              const sData = await sRes.json();
              if (sData && sData.program) {
                program = sData.program;
              }
            }
          } catch(e) {}
        }
      } catch(err) {
        alert('خطا در دریافت اطلاعات برنامه: ' + err.message);
        return;
      }
    } else if (typeof programOrId === 'object' && programOrId !== null) {
      program = programOrId;
    }

    if (!program) {
      alert('برنامه تمرینی برای تولید PDF یافت نشد.');
      return;
    }

    let modal = document.getElementById('programPdfModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'programPdfModal';
      modal.className = 'pdf-preview-modal';
      document.body.appendChild(modal);
    }

    const sheetHTML = generateProgramSheetHTML(program);

    modal.innerHTML = `
      <div class="pdf-toolbar no-print">
        <div class="pdf-toolbar-title">
          <span>📄</span>
          <b>پیش‌نمایش خروجی PDF و چاپ برنامه تمرینی</b>
        </div>
        <div class="pdf-toolbar-actions">
          <button type="button" class="pdf-btn pdf-btn-secondary" id="btnPdfCopyText">
            <span>📋</span> کپی متن برنامه
          </button>
          <button type="button" class="pdf-btn pdf-btn-primary" id="btnPdfPrint">
            <span>🖨️</span> چاپ / ذخیره PDF
          </button>
          <button type="button" class="pdf-btn pdf-btn-secondary pdf-btn-close" id="btnPdfClose" title="بستن">
            ×
          </button>
        </div>
      </div>
      <div class="pdf-content-wrapper" id="pdfWrapper">
        ${sheetHTML}
      </div>
    `;

    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    const close = () => {
      modal.hidden = true;
      document.body.style.overflow = '';
    };

    document.getElementById('btnPdfClose').onclick = close;
    document.getElementById('btnPdfPrint').onclick = () => {
      window.print();
    };

    const copyBtn = document.getElementById('btnPdfCopyText');
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          const plain = programToPlainText(program);
          await navigator.clipboard.writeText(plain);
          copyBtn.textContent = 'کپی شد ✓';
          setTimeout(() => {
            copyBtn.innerHTML = '<span>📋</span> کپی متن برنامه';
          }, 2000);
        } catch(e) {
          alert('امکان کپی خودکار فراهم نشد.');
        }
      };
    }

    const onKey = (e) => {
      if (e.key === 'Escape' && !modal.hidden) {
        close();
        window.removeEventListener('keydown', onKey);
      }
    };
    window.addEventListener('keydown', onKey);
  }

  // Export globally
  win.YasnafitPDF = {
    generateHTML: generateProgramSheetHTML,
    toPlainText: programToPlainText,
    open: openProgramPDF
  };
  win.openProgramPDF = openProgramPDF;
})();
