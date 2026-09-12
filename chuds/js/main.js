/* CHUDS — main.js (home page) */

document.addEventListener("DOMContentLoaded", () => {
  if (!ensureFirebaseConfigured()) return;

  ensureSignedIn().then((signedIn) => {
    if (!signedIn) return;

    renderTopbar("home").then(() =>
      Promise.all([
        CHUDS_DB.getTopUsers(10),
        CHUDS_DB.getCurrentUser(),
        CHUDS_DB.getRaceLeaders(6),
      ])
    ).then(([top, me, racers]) => {
      renderRace(racers, me);
      renderBoard(top, me);
    });
  });
});

function renderRace(racers, me) {
  const wrap = document.getElementById("race-lanes");
  const goal = CHUDS_DB.XP_GOAL;

  if (racers.length === 0 || racers.every((r) => r.totalPoints === 0)) {
    wrap.innerHTML = `<div class="empty-state">Nobody's banked any points yet — the first nightly awards will show up here.</div>`;
    return;
  }

  wrap.innerHTML = racers
    .map((r, i) => {
      const pct = Math.min(100, (r.totalPoints / goal) * 100);
      const isLeader = i === 0;
      const isMe = r.id === me.id;
      return `
        <div class="race-lane">
          <div class="race-lane__track"></div>
          <div class="race-lane__fill" style="width:${pct}%"></div>
          <span class="race-lane__flag">\u{1F3C1}</span>
          <div class="race-runner ${isLeader ? "race-runner--leader" : ""}" style="left:clamp(0px, ${pct}%, calc(100% - 150px))">
            <span class="race-runner__chip">${r.totalPoints}</span>
            <span class="race-runner__label">${escapeHtml(r.username)}${isMe ? " (you)" : ""}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderBoard(top, me) {
  const board = document.getElementById("board");

  if (top.length === 0) {
    board.innerHTML = `<div class="empty-state">No lifts logged yet. Be the first — hit "Log Lift" up top.</div>`;
    return;
  }

  board.innerHTML = top
    .map((u, i) => {
      const liftCount = Object.keys(u.lifts).length;
      const isMe = u.id === me.id;
      const avatar = u.photoUrl
        ? `<img class="avatar-thumb" src="${u.photoUrl}" alt="" />`
        : `<span class="avatar-thumb"></span>`;
      const profileHref = isMe ? "account.html" : `profile.html?u=${u.id}`;
      return `
        <div class="board-row ${isMe ? "board-row--me" : ""}">
          <div class="rank-num">${i + 1}</div>
          <div class="board-user">
            ${avatar}
            <div class="board-user__text">
              <a class="board-user__name" href="${profileHref}">${escapeHtml(u.username)}${
        isMe ? " (you)" : ""
      }</a>
              <span class="board-user__meta">${liftCount} lift${
        liftCount === 1 ? "" : "s"
      } logged</span>
            </div>
          </div>
          <div class="board-points">${u.totalPoints}<span>PTS</span></div>
        </div>
      `;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
