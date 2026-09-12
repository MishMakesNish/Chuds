/* CHUDS — profile.js (public read-only profile page) */

document.addEventListener("DOMContentLoaded", () => {
  if (!ensureFirebaseConfigured()) return;

  ensureSignedIn().then((signedIn) => {
    if (!signedIn) return;

    const params = new URLSearchParams(window.location.search);
    const userId = params.get("u");

    const usernameEl = document.getElementById("profile-username");
    const statRow = document.getElementById("stat-row");
    const liftList = document.getElementById("lift-list");
    const avatarImg = document.getElementById("avatar-img");
    const avatarDefaultIcon = document.getElementById("avatar-default-icon");

    renderTopbar(null).then(() => {
      if (!userId) {
        usernameEl.textContent = "Profile not found";
        liftList.innerHTML = `<div class="empty-state">No profile specified.</div>`;
        return;
      }

      return Promise.all([
        CHUDS_DB.getUserProfile(userId),
        CHUDS_DB.getExercises(),
      ]).then(([user, exercises]) => {
        if (!user) {
          usernameEl.textContent = "Profile not found";
          liftList.innerHTML = `<div class="empty-state">That person doesn't exist \u2014 maybe their account was removed.</div>`;
          return;
        }

        document.title = `Chuds \u2014 ${user.username}`;
        usernameEl.textContent = user.username;

        if (user.photoUrl) {
          avatarImg.src = user.photoUrl;
          avatarImg.style.display = "";
          avatarDefaultIcon.style.display = "none";
        }

        return CHUDS_DB.getUserRank(user.id).then((rank) => {
          statRow.innerHTML = `
            <div class="stat-pill"><strong>${user.totalPoints}</strong>total points</div>
            <div class="stat-pill"><strong>#${rank}</strong>current ranking</div>
            <div class="stat-pill"><strong>${
              Object.keys(user.lifts).length
            }</strong>lifts logged</div>
          `;
          renderLifts(user, exercises, liftList);
        });
      });
    });
  });
});

function renderLifts(user, exercises, liftList) {
  const entries = Object.entries(user.lifts);
  if (entries.length === 0) {
    liftList.innerHTML = `<div class="empty-state">No lifts logged yet.</div>`;
    return;
  }
  liftList.innerHTML = entries
    .map(([exId, entry]) => {
      const ex = exercises.find((e) => e.id === exId);
      if (!ex) return "";
      const { big, small } = formatLiftValue(ex, entry);
      return `
        <a class="lift-card" href="exercise.html?ex=${ex.id}" style="text-decoration:none; color:inherit; display:block;">
          <div class="lift-card__name">${ex.name}</div>
          <div class="lift-card__value">${big}<span>${small}</span></div>
        </a>
      `;
    })
    .join("");
}
