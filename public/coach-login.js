(() => {
  'use strict';
  const passwordForm = document.getElementById('coachPasswordForm');
  const otpForm = document.getElementById('coachOtpForm');
  const errorBox = document.getElementById('coachLoginError');
  const lead = document.getElementById('coachLoginLead');
  const otpHint = document.getElementById('coachOtpHint');
  const passwordSubmit = document.getElementById('coachPasswordSubmit');
  const otpSubmit = document.getElementById('coachOtpSubmit');
  let challengeId = '';

  function showError(message) {
    errorBox.hidden = !message;
    errorBox.textContent = message || '';
  }
  function setBusy(button, busy, label) {
    button.disabled = busy;
    if (label) button.textContent = label;
  }
  async function api(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'ورود انجام نشد'), { code: data.code, status: response.status });
    return data;
  }

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
        ? `کد تأیید به ${result.email} ارسال شد و تا ۱۰ دقیقه معتبر است.`
        : 'کد تأیید به ایمیل مربی ارسال شد.';
      document.getElementById('coachOtp').focus();
    } catch (error) {
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
})();
