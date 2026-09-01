(() => {
  'use strict';
  const errorBox = document.getElementById('coachLoginError');
  const path = location.pathname;

  function showError(message, isSuccess) {
    if (!errorBox) return;
    errorBox.hidden = !message;
    errorBox.textContent = message || '';
    errorBox.classList.toggle('is-success', Boolean(isSuccess && message));
  }
  function setBusy(button, busy, label) {
    if (!button) return;
    button.disabled = busy;
    if (label) button.textContent = label;
  }
  async function api(url, body, method = 'POST') {
    const response = await fetch(url, {
      method,
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body || {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'درخواست انجام نشد'), { code: data.code, status: response.status });
    return data;
  }

  async function loadStatus() {
    try {
      return await api('/api/coach/auth/status', null, 'GET');
    } catch (error) {
      return { setup_required: false };
    }
  }

  if (path === '/coach/login') {
    const passwordForm = document.getElementById('coachPasswordForm');
    const otpForm = document.getElementById('coachOtpForm');
    const lead = document.getElementById('coachLoginLead');
    const otpHint = document.getElementById('coachOtpHint');
    const passwordSubmit = document.getElementById('coachPasswordSubmit');
    const otpSubmit = document.getElementById('coachOtpSubmit');
    let challengeId = '';

    loadStatus().then(status => {
      if (status.setup_required) location.replace('/coach/setup');
      else if (status.totp_required) location.replace('/coach/2fa');
    });

    passwordForm.addEventListener('submit', async event => {
      event.preventDefault();
      showError('');
      setBusy(passwordSubmit, true, 'در حال بررسی…');
      try {
        const result = await api('/api/coach/auth/login', {
          email: document.getElementById('coachEmail').value,
          password: document.getElementById('coachPassword').value
        });
        challengeId = result.challenge_id;
        passwordForm.hidden = true;
        otpForm.hidden = false;
        lead.textContent = 'کد ۶ رقمی Google Authenticator را وارد کنید.';
        otpHint.textContent = 'کد برنامه Authenticator هر ۳۰ ثانیه عوض می‌شود. برای وارد کردن آن ۵ دقیقه فرصت دارید.';
        document.getElementById('coachOtp').focus();
      } catch (error) {
        if (error.code === 'SETUP_REQUIRED') {
          location.replace('/coach/setup');
          return;
        }
        if (error.code === 'TOTP_SETUP_REQUIRED') {
          location.replace('/coach/2fa');
          return;
        }
        showError(error.message);
      } finally {
        setBusy(passwordSubmit, false, 'ادامه');
      }
    });

    otpForm.addEventListener('submit', async event => {
      event.preventDefault();
      showError('');
      setBusy(otpSubmit, true, 'در حال ورود…');
      try {
        await api('/api/coach/auth/verify', {
          challenge_id: challengeId,
          code: document.getElementById('coachOtp').value
        });
        location.replace('/coach/dashboard');
      } catch (error) {
        showError(error.message);
      } finally {
        setBusy(otpSubmit, false, 'ورود به پنل');
      }
    });

    document.getElementById('coachOtpBack').addEventListener('click', () => {
      challengeId = '';
      otpForm.hidden = true;
      passwordForm.hidden = false;
      document.getElementById('coachOtp').value = '';
      lead.textContent = 'ایمیل و رمز عبور خود را وارد کنید.';
      showError('');
    });
    return;
  }

  if (path === '/coach/setup') {
    const form = document.getElementById('coachSetupForm');
    const submit = document.getElementById('coachSetupSubmit');
    loadStatus().then(status => {
      if (!status.setup_required) location.replace('/coach/login');
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      showError('');
      const password = document.getElementById('coachSetupPassword').value;
      const confirm = document.getElementById('coachSetupPasswordConfirm').value;
      if (password !== confirm) {
        showError('تکرار رمز عبور مطابقت ندارد.');
        return;
      }
      setBusy(submit, true, 'در حال ساخت…');
      try {
        await api('/api/coach/auth/setup', {
          email: document.getElementById('coachSetupEmail').value,
          password
        });
        location.replace('/coach/2fa');
      } catch (error) {
        if (error.code === 'SETUP_CLOSED') {
          location.replace('/coach/login');
          return;
        }
        showError(error.message);
      } finally {
        setBusy(submit, false, 'ساخت اکانت');
      }
    });
    return;
  }

  if (path === '/coach/2fa') {
    const form = document.getElementById('coachTotpForm');
    const submit = document.getElementById('coachTotpSubmit');
    const qrBox = document.getElementById('coachTotpQr');
    const secretBox = document.getElementById('coachTotpSecret');
    loadStatus().then(async status => {
      if (status.setup_required) {
        location.replace('/coach/setup');
        return;
      }
      if (!status.totp_required) {
        location.replace('/coach/login');
        return;
      }
      try {
        const setup = await api('/api/coach/auth/totp', null, 'GET');
        if (qrBox) qrBox.innerHTML = setup.qr_svg || '';
        if (secretBox) secretBox.textContent = setup.secret_display || setup.secret || '';
      } catch (error) {
        if (error.code === 'TOTP_ALREADY_SET') location.replace('/coach/login');
        else showError(error.message);
      }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      showError('');
      setBusy(submit, true, 'در حال تأیید…');
      try {
        await api('/api/coach/auth/totp/confirm', {
          code: document.getElementById('coachTotpCode').value
        });
        location.replace('/coach/login');
      } catch (error) {
        if (error.code === 'TOTP_ALREADY_SET') {
          location.replace('/coach/login');
          return;
        }
        showError(error.message);
      } finally {
        setBusy(submit, false, 'فعال‌سازی');
      }
    });
    return;
  }

  if (path === '/coach/forgot') {
    const form = document.getElementById('coachForgotForm');
    const submit = document.getElementById('coachForgotSubmit');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      showError('');
      setBusy(submit, true, 'در حال ارسال…');
      try {
        const result = await api('/api/coach/auth/forgot', {
          email: document.getElementById('coachForgotEmail').value
        });
        showError(result.message || 'اگر این ایمیل ثبت شده باشد، لینک بازیابی آماده می‌شود.', true);
      } catch (error) {
        showError(error.message);
      } finally {
        setBusy(submit, false, 'ارسال لینک بازیابی');
      }
    });
    return;
  }

  if (path === '/coach/mail') {
    const form = document.getElementById('coachMailForm');
    const submit = document.getElementById('coachMailSubmit');
    loadStatus().then(status => {
      if (status.mail_configured) {
        showError('ارسال جیمیل قبلاً تنظیم شده است. اگر کد نمی‌رسد، رمز برنامه را دوباره ذخیره کنید.', true);
      }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      showError('');
      setBusy(submit, true, 'در حال ارسال آزمایشی…');
      try {
        await api('/api/coach/auth/mail', {
          app_password: document.getElementById('coachMailPassword').value
        });
        showError('ایمیل آزمایشی به crypto.javan17@gmail.com ارسال شد. اینباکس و پوشه اسپم را بررسی کنید.', true);
        setTimeout(() => location.replace('/coach/login'), 1400);
      } catch (error) {
        showError(error.message || 'ارسال آزمایشی به جیمیل انجام نشد.');
      } finally {
        setBusy(submit, false, 'ارسال ایمیل آزمایشی و ذخیره');
      }
    });
    return;
  }

  if (path === '/coach/reset') {
    const form = document.getElementById('coachResetForm');
    const submit = document.getElementById('coachResetSubmit');
    const token = new URLSearchParams(location.search).get('token') || '';
    if (!token) showError('لینک بازیابی نامعتبر است.');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      showError('');
      const password = document.getElementById('coachResetPassword').value;
      const confirm = document.getElementById('coachResetPasswordConfirm').value;
      if (password !== confirm) {
        showError('تکرار رمز عبور مطابقت ندارد.');
        return;
      }
      setBusy(submit, true, 'در حال ذخیره…');
      try {
        await api('/api/coach/auth/reset', { token, password });
        location.replace('/coach/login');
      } catch (error) {
        showError(error.message);
      } finally {
        setBusy(submit, false, 'ذخیره رمز جدید');
      }
    });
  }
})();
