const SESSION_ENDPOINT = "/auth/session";
const LOGIN_ENDPOINT = "/auth/login";
const LOGOUT_ENDPOINT = "/auth/logout";

const loginForm = document.getElementById("login-form");
const statusEl = document.getElementById("auth-status");
const submitBtn = document.getElementById("login-submit");
const logoutBtn = document.getElementById("logout-button");

boot().catch((error) => {
  console.error(error);
});

async function boot() {
  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      void handleLoginSubmit(event);
    });

    await redirectIfAlreadyAuthenticated();
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      void handleLogout();
    });
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  if (!(loginForm instanceof HTMLFormElement)) {
    return;
  }

  const formData = new FormData(loginForm);
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  setStatus("جاري التحقق من بيانات الدخول...", false);
  setLoading(true);

  try {
    const response = await fetch(LOGIN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ username, password }),
    });

    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(payload?.message || "تعذر تسجيل الدخول.");
    }

    setStatus("تم تسجيل الدخول بنجاح. جاري التحويل...", false);
    window.location.href = payload?.redirectTo || "/dashboard";
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تسجيل الدخول.";
    setStatus(message, true);
  } finally {
    setLoading(false);
  }
}

async function redirectIfAlreadyAuthenticated() {
  try {
    const response = await fetch(SESSION_ENDPOINT, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });

    if (!response.ok) {
      return;
    }

    const payload = await readJson(response);
    if (payload?.authenticated) {
      window.location.replace("/dashboard");
    }
  } catch {
    // Ignore auth probing failures on initial page load.
  }
}

async function handleLogout() {
  if (logoutBtn) {
    logoutBtn.disabled = true;
  }

  try {
    await fetch(LOGOUT_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
  } finally {
    window.location.assign("/login");
  }
}

function setLoading(isLoading) {
  if (submitBtn instanceof HTMLButtonElement) {
    submitBtn.disabled = isLoading;
  }
}

function setStatus(text, isError) {
  if (!statusEl) {
    return;
  }

  statusEl.textContent = text;
  statusEl.classList.toggle("error", Boolean(isError));
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
