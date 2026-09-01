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
        lead.textContent = 'کد ۶ رقمی ارسال‌شده به ایمیل را وارد کنید.';
        otpHint.textContent = result.email
          ? `کد تأیید به ${result.email} ارسال شد و تا ۵ دقیقه معتبر است.`
          : 'کد تأیید به ایمیل مربی ارسال شد و تا ۵ دقیقه معتبر است.';
        document.getElementById('coachOtp').focus();
      } catch (error) {
        if (error.code === 'SETUP_REQUIRED') {
          location.replace('/coach/setup');
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
        location.replace('/coach/login');
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
        showError(result.message || 'اگر این ایمیل ثبت شده باشد، لینک بازیابی ارسال می‌شود.', true);
      } catch (error) {
        showError(error.message);
      } finally {
        setBusy(submit, false, 'ارسال لینک بازیابی');
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
