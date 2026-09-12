/* =========================================================================
   CHUDS — nav.js
   Builds the top bar on every page (profile, notification bell, tabs).
   Pass the current page's id so the right tab can be highlighted.
   ========================================================================= */

const PROFILE_ICON = `<svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12zm0 2.5c-3.3 0-9.8 1.7-9.8 5v2.3h19.6V19.5c0-3.3-6.5-5-9.8-5z"/></svg>`;
const BELL_ICON = `<svg viewBox="0 0 24 24"><path d="M12 22c1.24 0 2.24-1 2.24-2.24h-4.49c0 1.24 1 2.24 2.25 2.24zm7.24-6.24V11c0-3.53-1.88-6.49-5.24-7.27V3c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.73C7.65 4.51 5.76 7.46 5.76 11v4.76L4 17.51V18.5h16v-.99l-1.76-1.75z"/></svg>`;

function timeAgo(isoDate) {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Call this FIRST in every page's DOMContentLoaded, before renderTopbar
// or any other CHUDS_DB call. Returns false (and shows a setup message
// in place of the whole page) if js/firebase-config.js still has its
// placeholder values.
function ensureFirebaseConfigured() {
  if (CHUDS_DB.isConfigured) return true;
  document.body.innerHTML = `
    <div style="max-width:560px;margin:100px auto;padding:36px;font-family:'Archivo',sans-serif;
                background:#16233c;color:#f2f4f8;border:1px solid #22304a;border-radius:8px;line-height:1.6;">
      <h1 style="font-family:'Anton',sans-serif;font-size:26px;margin:0 0 14px;letter-spacing:0.5px;">
        Firebase isn't connected yet
      </h1>
      <p style="color:#8b96ac;margin:0 0 10px;">
        This site needs a free Firebase project so everyone who visits shares
        the same leaderboard, points, and notifications.
      </p>
      <p style="color:#8b96ac;margin:0;">
        Open <code style="background:#0a1120;padding:2px 6px;border-radius:3px;">js/firebase-config.js</code>
        and paste in your project's config values — README.md walks through
        exactly where to get them, then refresh this page.
      </p>
    </div>`;
  return false;
}

// Call this SECOND in every page's DOMContentLoaded (after
// ensureFirebaseConfigured, before renderTopbar). Shows a sign
// in / create account form in place of the page and returns false if
// nobody's signed in yet; returns true (and does nothing) if they are.
function ensureSignedIn() {
  return CHUDS_DB.isSignedIn().then((signedIn) => {
    if (signedIn) return true;
    renderAuthGate();
    return false;
  });
}

function renderAuthGate() {
  document.body.innerHTML = `
    <div class="page" style="max-width:420px;">
      <div class="page-head">
        <h1 class="page-title">CHUDS</h1>
        <p class="page-sub">Sign in, or create an account if you're new.</p>
      </div>
      <form id="auth-form" class="form-card">
        <div class="field" id="auth-username-field" style="display:none;">
          <label for="auth-username">Username</label>
          <input id="auth-username" type="text" maxlength="24" />
        </div>
        <div class="field">
          <label for="auth-email">Email</label>
          <input id="auth-email" type="email" required />
        </div>
        <div class="field">
          <label for="auth-password">Password</label>
          <input id="auth-password" type="password" required minlength="6" />
          <p class="help-text">At least 6 characters.</p>
        </div>
        <button type="submit" class="btn btn--primary btn--full" id="auth-submit-btn">Sign in</button>
        <button type="button" class="btn btn--full" id="auth-toggle-btn" style="margin-top:10px;">New here? Create an account</button>
        <div id="auth-msg" class="status-msg"></div>
      </form>
    </div>
  `;

  const form = document.getElementById("auth-form");
  const usernameField = document.getElementById("auth-username-field");
  const usernameInput = document.getElementById("auth-username");
  const emailInput = document.getElementById("auth-email");
  const passwordInput = document.getElementById("auth-password");
  const submitBtn = document.getElementById("auth-submit-btn");
  const toggleBtn = document.getElementById("auth-toggle-btn");
  const msg = document.getElementById("auth-msg");

  let mode = "signin"; // or "signup"

  toggleBtn.addEventListener("click", () => {
    mode = mode === "signin" ? "signup" : "signin";
    const isSignup = mode === "signup";
    usernameField.style.display = isSignup ? "" : "none";
    submitBtn.textContent = isSignup ? "Create account" : "Sign in";
    toggleBtn.textContent = isSignup
      ? "Already have an account? Sign in"
      : "New here? Create an account";
    msg.className = "status-msg";
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    msg.className = "status-msg";

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    submitBtn.disabled = true;

    const action =
      mode === "signup"
        ? CHUDS_DB.signUp(email, password, usernameInput.value.trim())
        : CHUDS_DB.signIn(email, password);

    action
      .then(() => {
        // Simplest reliable way to make every page re-initialize cleanly
        // against the now-signed-in state.
        window.location.reload();
      })
      .catch((err) => {
        submitBtn.disabled = false;
        msg.textContent = err.message || "Something went wrong.";
        msg.className = "status-msg status-msg--show status-msg--info";
      });
  });
}

function renderTopbar(activePage) {
  const root = document.getElementById("topbar-root");
  if (!root) return Promise.resolve();

  const tab = (page, label, href) =>
    `<a class="nav-tab ${
      activePage === page ? "nav-tab--active" : ""
    }" href="${href}">${label}</a>`;

  // Waits for any overnight points/streaks to be applied before the rest
  // of the page reads leaderboard data, so numbers are never stale. If
  // this fails for any reason (e.g. a security rules mismatch), the top
  // bar still renders — a failed points job shouldn't take the whole
  // page down with it, and the error is at least visible in the console
  // instead of vanishing silently.
  return CHUDS_DB.runDailyJob().catch((err) => {
    console.error("Nightly points job didn't complete:", err);
  }).then(() => {
    root.innerHTML = `
      <header class="topbar">
        <div class="topbar__side">
          <a class="profile-btn" href="account.html" title="Account settings">
            ${PROFILE_ICON}
          </a>
          <div class="notif-wrap">
            <button class="notif-btn" id="notif-btn" title="Notifications" type="button">
              ${BELL_ICON}
              <span class="notif-badge" id="notif-badge"></span>
            </button>
            <div class="notif-panel" id="notif-panel">
              <div class="notif-panel__head">
                <span class="notif-panel__title">Notifications</span>
                <button class="notif-panel__clear" id="notif-clear" type="button">Mark all read</button>
              </div>
              <div id="notif-body"></div>
            </div>
          </div>
        </div>
        <a class="logo" href="index.html">CHUDS</a>
        <div class="topbar__side topbar__side--right">
          ${tab("log-lift", "Log Lift", "log-lift.html")}
          ${tab("log-pr", "Log PR", "log-pr.html")}
          ${tab("leaderboards", "Leaderboards", "leaderboards.html")}
        </div>
      </header>
    `;
    wireNotifications();

    // Best-effort: swap the generic icon for the person's own photo, if
    // they've set one. Not critical to the page working, so it's kept
    // separate from the render chain above.
    CHUDS_DB.getCurrentUser().then((me) => {
      if (!me.photoUrl) return;
      const btn = document.querySelector(".profile-btn");
      if (btn) btn.innerHTML = `<img class="avatar-thumb" style="width:100%;height:100%;" src="${me.photoUrl}" alt="" />`;
    }).catch(() => {});
  });
}

function wireNotifications() {
  const btn = document.getElementById("notif-btn");
  const panel = document.getElementById("notif-panel");
  const badge = document.getElementById("notif-badge");
  const body = document.getElementById("notif-body");
  const clearBtn = document.getElementById("notif-clear");

  function refresh() {
    CHUDS_DB.getNotifications().then((notifs) => {
      const unread = notifs.filter((n) => !n.read).length;
      badge.textContent = unread > 9 ? "9+" : String(unread);
      badge.className = "notif-badge" + (unread > 0 ? " notif-badge--show" : "");

      if (notifs.length === 0) {
        body.innerHTML = `<div class="notif-empty">No notifications yet. Get overtaken on a leaderboard and you'll hear about it here.</div>`;
        return;
      }

      body.innerHTML = notifs
        .map(
          (n) => `
        <div class="notif-row ${n.read ? "" : "notif-row--unread"}">
          ${escapeNotifText(n.message)}
          <span class="notif-row__time">${timeAgo(n.date)}</span>
        </div>
      `
        )
        .join("");
    });
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = panel.classList.toggle("notif-panel--show");
    if (isOpen) refresh();
  });

  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    CHUDS_DB.markNotificationsRead().then(refresh);
  });

  panel.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("click", () => {
    panel.classList.remove("notif-panel--show");
  });

  refresh();
}

function escapeNotifText(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
