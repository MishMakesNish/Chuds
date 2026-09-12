/* CHUDS — leaderboards.js */

document.addEventListener("DOMContentLoaded", () => {
  if (!ensureFirebaseConfigured()) return;

  ensureSignedIn().then((signedIn) => {
    if (!signedIn) return;

    renderTopbar("leaderboards").then(() =>
      Promise.all([CHUDS_DB.getExercises(), CHUDS_DB.getPRExercises()])
    ).then(([exercises, prExercises]) => {
      renderGrid(prExercises, document.getElementById("pr-tile-grid"), true);
      renderGrid(exercises, document.getElementById("tile-grid"), false);
    });
  });
});

function renderGrid(exercises, grid, isPR) {
  const streakFetch = isPR ? CHUDS_DB.getPRStreak.bind(CHUDS_DB) : CHUDS_DB.getStreak.bind(CHUDS_DB);
  Promise.all(exercises.map((ex) => streakFetch(ex.id))).then((streaks) => {
    grid.innerHTML = exercises
      .map((ex, i) => {
        const streak = streaks[i];
        const streakTag =
          streak && streak.streakDays > 0
            ? `<div class="tile__streak">\u{1F525} ${streak.streakDays}d \u2014 ${escapeHtml(
                streak.leaderUsername
              )}</div>`
            : "";
        const href = isPR ? `exercise.html?ex=${ex.id}&pr=1` : `exercise.html?ex=${ex.id}`;
        const label = isPR ? `${ex.name} PR` : ex.name;
        return `
          <a class="tile" href="${href}">
            <img
              class="tile__img"
              src="assets/img/${ex.id}.jpg"
              alt=""
              onload="this.nextElementSibling.style.display='none'"
              onerror="tileImgFallback(this, 'assets/img/${ex.id}.svg')"
            />
            <div class="tile__placeholder">DROP PHOTO HERE</div>
            ${streakTag}
            <div class="tile__label">${label}</div>
          </a>
        `;
      })
      .join("");
  });
}

// Tries a real photo (.jpg, added by you later) first; if that 404s,
// falls back to the bundled .svg icon; if THAT also fails, shows the
// "DROP PHOTO HERE" placeholder text underneath.
function tileImgFallback(img, svgSrc) {
  img.onerror = function () {
    img.style.display = "none";
  };
  img.onload = function () {
    img.nextElementSibling.style.display = "none";
  };
  img.src = svgSrc;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
