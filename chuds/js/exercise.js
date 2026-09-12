/* CHUDS — exercise.js (handles both regular and PR leaderboards) */

document.addEventListener("DOMContentLoaded", () => {
  if (!ensureFirebaseConfigured()) return;

  const params = new URLSearchParams(window.location.search);
  const exId = params.get("ex");
  const isPR = params.get("pr") === "1";
  const titleEl = document.getElementById("ex-title");
  const board = document.getElementById("board");
  let currentEx = null;

  ensureSignedIn().then((signedIn) => {
    if (!signedIn) return;

    renderTopbar("leaderboards").then(() => {
      if (!exId) {
        titleEl.textContent = "Exercise not found";
        board.innerHTML = `<div class="empty-state">No exercise specified. Go back and pick one from the leaderboards tab.</div>`;
        return;
      }

      const exercisesLookup = isPR ? CHUDS_DB.getPRExercises() : CHUDS_DB.getExercises();
      return exercisesLookup.then((list) => {
        const ex = list.find((e) => e.id === exId);
        if (!ex) {
          titleEl.textContent = "Exercise not found";
          board.innerHTML = isPR
            ? `<div class="empty-state">That's not one of the PR exercises.</div>`
            : `<div class="empty-state">That exercise doesn't exist.</div>`;
          return;
        }
        currentEx = ex;

        titleEl.textContent = isPR ? `${ex.name} PR` : ex.name;
        document.title = `Chuds \u2014 ${titleEl.textContent}`;

        return loadBoard();
      });
    });
  });

  function loadBoard() {
    const leaderboardFetch = isPR
      ? CHUDS_DB.getPRLeaderboard(currentEx.id, 10)
      : CHUDS_DB.getExerciseLeaderboard(currentEx.id, 10);
    const streakFetch = isPR ? CHUDS_DB.getPRStreak(currentEx.id) : CHUDS_DB.getStreak(currentEx.id);

    return Promise.all([leaderboardFetch, streakFetch, CHUDS_DB.isAdmin()]).then(
      ([rows, streak, isAdmin]) => {
        if (rows.length === 0) {
          const logTab = isPR ? "Log PR" : "Log Lift";
          board.innerHTML = `<div class="empty-state">No one has logged ${
            currentEx.name
          }${isPR ? " PR" : ""} yet. Be the first from the "${logTab}" tab.</div>`;
          return;
        }

        board.innerHTML = rows
          .map((row, i) => {
            const { big, small } = formatLiftValue(currentEx, row);
            const showStreak =
              i === 0 && streak && streak.leaderId === row.userId && streak.streakDays > 0;
            const streakBadge = showStreak
              ? `<span class="streak-badge">\u{1F525} ${streak.streakDays} day${
                  streak.streakDays === 1 ? "" : "s"
                } at #1</span>`
              : "";

            const proofTag = row.proofName
              ? `<span class="proof-tag" title="${escapeHtml(row.proofName)}">\u{1F4CE} ${escapeHtml(
                  row.proofName
                )}</span>`
              : `<span class="proof-tag proof-tag--empty">No proof</span>`;

            const deleteBtn = isAdmin
              ? `<button class="admin-delete-btn" type="button"
                   data-user-id="${row.userId}" data-username="${escapeHtml(row.username)}"
                   title="Delete this submission">\u2715</button>`
              : "";

            const avatar = row.photoUrl
              ? `<img class="avatar-thumb" src="${row.photoUrl}" alt="" />`
              : `<span class="avatar-thumb"></span>`;

            return `
              <div class="board-row exercise-row">
                <div class="rank-num">${i + 1}</div>
                <div class="board-user">
                  ${avatar}
                  <div class="board-user__text">
                    <span><a class="board-user__name" href="profile.html?u=${row.userId}">${escapeHtml(row.username)}</a>${streakBadge}</span>
                    <span class="board-user__meta">${new Date(
                      row.date
                    ).toLocaleDateString()}</span>
                  </div>
                </div>
                <div class="value-cell">${big}<span>${small}</span></div>
                ${proofTag}
                ${deleteBtn}
              </div>
            `;
          })
          .join("");
      }
    );
  }

  board.addEventListener("click", (e) => {
    const btn = e.target.closest(".admin-delete-btn");
    if (!btn) return;
    const { userId, username } = btn.dataset;
    const boardLabel = isPR ? `${currentEx.name} PR` : currentEx.name;
    const ok = window.confirm(
      `Delete ${username}'s ${boardLabel} submission? This can't be undone.`
    );
    if (!ok) return;
    btn.disabled = true;
    const deleteFn = isPR
      ? CHUDS_DB.deletePRLift.bind(CHUDS_DB)
      : CHUDS_DB.deleteLift.bind(CHUDS_DB);
    deleteFn(userId, currentEx.id)
      .then(loadBoard)
      .catch((err) => window.alert(err.message || "Couldn't delete that submission."));
  });
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
