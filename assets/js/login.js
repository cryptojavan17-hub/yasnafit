(function () {
  const toastEl = document.getElementById("toast");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const forgotForm = document.getElementById("forgotForm");
  const switchBtn = document.getElementById("switchAuth");
  const switchText = document.getElementById("switchText");
  const forgotBtn = document.getElementById("forgotBtn");
  const orDivider = document.getElementById("orDivider");

  const intros = {
    login: document.getElementById("introLogin"),
    register: document.getElementById("introRegister"),
    forgot: document.getElementById("introForgot"),
  };

  let mode = "login";

  function toEnglishDigits(value) {
    const fa = "۰۱۲۳۴۵۶۷۸۹";
    const ar = "٠١٢٣٤٥٦٧٨٩";
    return String(value).replace(/[۰-۹٠-٩]/g, (d) => {
      const i = fa.indexOf(d);
      return String(i >= 0 ? i : ar.indexOf(d));
    });
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => toastEl.classList.remove("show"), 2800);
  }

  function setError(id, message) {
    const group = document.getElementById(id)?.closest(".field-group");
    const slot = document.querySelector(`[data-error="${id}"]`);
    if (group) group.classList.toggle("invalid", Boolean(message));
    if (slot) slot.textContent = message || "";
  }

  function clearFormErrors(form) {
    form.querySelectorAll(".field-group").forEach((g) => g.classList.remove("invalid"));
    form.querySelectorAll(".error").forEach((e) => {
      e.textContent = "";
    });
  }

  function isPhone(value) {
    return /^0\d{10}$/.test(value);
  }

  function setLoading(button, loading) {
    const text = button.querySelector(".btn-text");
    const spinner = button.querySelector(".btn-spinner");
    button.disabled = loading;
    text?.classList.toggle("hidden", loading);
    spinner?.classList.toggle("hidden", !loading);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setMode(next) {
    mode = next;
    loginForm.classList.toggle("hidden", next !== "login");
    registerForm.classList.toggle("hidden", next !== "register");
    forgotForm.classList.toggle("hidden", next !== "forgot");
    intros.login.classList.toggle("hidden", next !== "login");
    intros.register.classList.toggle("hidden", next !== "register");
    intros.forgot.classList.toggle("hidden", next !== "forgot");
    orDivider.classList.toggle("hidden", next === "forgot");

    if (next === "login") {
      switchText.textContent = "حساب کاربری ندارید؟ ثبت‌نام کنید";
      switchBtn.classList.remove("hidden");
    } else if (next === "register") {
      switchText.textContent = "حساب دارید؟ وارد شوید";
      switchBtn.classList.remove("hidden");
    } else {
      switchText.textContent = "بازگشت به ورود";
      switchBtn.classList.remove("hidden");
    }
  }

  document.querySelectorAll(".field-eye").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.toggle);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.querySelector(".eye-on")?.classList.toggle("hidden", show);
      btn.querySelector(".eye-off")?.classList.toggle("hidden", !show);
      btn.setAttribute("aria-label", show ? "پنهان کردن رمز عبور" : "نمایش رمز عبور");
    });
  });

  document.querySelectorAll('input[type="tel"]').forEach((input) => {
    input.addEventListener("input", () => {
      const cleaned = toEnglishDigits(input.value).replace(/\D/g, "").slice(0, 11);
      input.value = cleaned;
      setError(input.id, "");
    });
  });

  switchBtn.addEventListener("click", () => {
    if (mode === "login") setMode("register");
    else setMode("login");
  });

  forgotBtn.addEventListener("click", () => setMode("forgot"));

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(loginForm);

    const phone = toEnglishDigits(document.getElementById("loginPhone").value).trim();
    const password = document.getElementById("loginPassword").value;
    let valid = true;

    if (!isPhone(phone)) {
      setError("loginPhone", "شماره همراه معتبر وارد کنید (۱۱ رقم و شروع با ۰).");
      valid = false;
    }
    if (password.length < 6) {
      setError("loginPassword", "رمز عبور باید حداقل ۶ کاراکتر باشد.");
      valid = false;
    }
    if (!valid) return;

    const submit = document.getElementById("loginSubmit");
    setLoading(submit, true);
    await wait(900);
    setLoading(submit, false);
    showToast("ورود با موفقیت انجام شد. به پورتال شاگردان خوش آمدید.");
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(registerForm);

    const name = document.getElementById("regName").value.trim();
    const phone = toEnglishDigits(document.getElementById("regPhone").value).trim();
    const password = document.getElementById("regPassword").value;
    const password2 = document.getElementById("regPassword2").value;
    let valid = true;

    if (name.length < 3) {
      setError("regName", "نام کامل را وارد کنید.");
      valid = false;
    }
    if (!isPhone(phone)) {
      setError("regPhone", "شماره همراه معتبر وارد کنید.");
      valid = false;
    }
    if (password.length < 6) {
      setError("regPassword", "رمز عبور باید حداقل ۶ کاراکتر باشد.");
      valid = false;
    }
    if (password !== password2) {
      setError("regPassword2", "تکرار رمز عبور مطابقت ندارد.");
      valid = false;
    }
    if (!valid) return;

    const submit = document.getElementById("registerSubmit");
    setLoading(submit, true);
    await wait(900);
    setLoading(submit, false);
    showToast("حساب شاگرد ساخته شد. اکنون می‌توانید وارد شوید.");
    setMode("login");
    document.getElementById("loginPhone").value = phone;
  });

  forgotForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormErrors(forgotForm);
    const phone = toEnglishDigits(document.getElementById("forgotPhone").value).trim();
    if (!isPhone(phone)) {
      setError("forgotPhone", "شماره همراه معتبر وارد کنید.");
      return;
    }
    const submit = document.getElementById("forgotSubmit");
    setLoading(submit, true);
    await wait(900);
    setLoading(submit, false);
    showToast("کد بازیابی به شماره همراه شما ارسال شد.");
    setMode("login");
  });
})();
