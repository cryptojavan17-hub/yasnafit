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
      credentials: 'same-origin',
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body || {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'درخواست انجام نشد'), { code: data.code, status: response.status });
    return data;
  }

  if (path === '/coach/setup') {
    const form = document.getElementById('coachSetupForm');
    const submit = document.getElementById('coachSetupSubmit');
    api('/api/coach/auth/status', null, 'GET').then(status => {
      if (!status.setup_required) location.replace('/coach/login');
    }).catch(() => {});
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

  if (path === '/coach/login') {
    const form = document.getElementById('coachPasswordForm');
    const submit = document.getElementById('coachPasswordSubmit');
    api('/api/coach/auth/status', null, 'GET').then(status => {
      if (status.setup_required) location.replace('/coach/setup');
    }).catch(() => {});
    form.addEventListener('submit', async event => {
      event.preventDefault();
      showError('');
      setBusy(submit, true, 'در حال بررسی…');
      try {
        await api('/api/coach/auth/login', {
          email: document.getElementById('coachEmail').value,
          password: document.getElementById('coachPassword').value
        });
        location.replace('/coach/2fa');
      } catch (error) {
        if (error.code === 'SETUP_REQUIRED') {
          location.replace('/coach/setup');
          return;
        }
        showError(error.message);
      } finally {
        setBusy(submit, false, 'ادامه');
      }
    });
    return;
  }

  if (path === '/coach/2fa') {
    const form = document.getElementById('coachTotpForm');
    const submit = document.getElementById('coachTotpSubmit');
    api('/api/coach/auth/challenge', null, 'GET').then(status => {
      if (!status.pending) location.replace('/coach/login');
    }).catch(() => location.replace('/coach/login'));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      showError('');
      setBusy(submit, true, 'در حال ورود…');
      try {
        await api('/api/coach/auth/verify', {
          code: document.getElementById('coachTotpCode').value
        });
        location.replace('/coach/dashboard');
      } catch (error) {
        if (error.code === 'CODE_EXPIRED' || error.code === 'CHALLENGE_REQUIRED') {
          location.replace('/coach/login');
          return;
        }
        showError(error.message);
      } finally {
        setBusy(submit, false, 'ورود به پنل');
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
