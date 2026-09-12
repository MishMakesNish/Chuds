/* =========================================================================
   CHUDS — data.js
   -------------------------------------------------------------------------
   This is the ONLY file that talks to storage. Every other page calls the
   functions below instead of touching the database directly.

   This now runs on Firebase Firestore (a free shared database) and
   Firebase Authentication (real accounts) — every visitor sees the same
   leaderboard, and each person's data follows their account, not their
   browser. You still need your own free Firebase project's config
   pasted into js/firebase-config.js, Email/Password sign-in turned on,
   and your own email set as the admin in js/firebase-config.js — see
   README.md.

   Proof is filename-only by choice (not an uploaded file) — Firebase
   Storage would make it a real viewable file, but as of Feb 2026 it
   requires a linked billing card even for free-tier usage, which was
   deliberately skipped for now. logLift()'s `meta.proofName` is the
   spot to extend if that trade-off changes later.

   The public function names/shapes below (getCurrentUser, logLift,
   getTopUsers, etc.) are unchanged from the local-only version, and every
   one of them still returns a Promise — so no other file needed to
   change when the guts switched from localStorage to a real database.
   ========================================================================= */

const CHUDS_DB = (function () {
  const XP_GOAL = 100; // race-to-100 finish line

  /* ---------------------------------------------------------------------
     EXERCISE CATALOG
     Add/remove/rename lifts here and every dropdown + leaderboard box
     on the site updates automatically.
     type: "weight"  -> ranked by total volume (weight x reps) for the
                        regular Log Lift flow. Heaviest single-rep max
                        for the separate PR flow (see `pr: true` below).
     type: "reps"    -> most reps wins
     type: "time"    -> fastest time wins (seconds, lower is better)
     type: "distance"-> longest distance wins (km), time recorded too

     pr: true marks an exercise as also having a SEPARATE true 1-rep-max
     leaderboard, logged via the Log PR tab, worth DOUBLE nightly points.
     It's independent from that same exercise's regular leaderboard.
  --------------------------------------------------------------------- */
  const EXERCISES = [
    { id: "bench-press", name: "Bench Press", type: "weight", pr: true },
    { id: "leg-press", name: "Leg Press", type: "weight", pr: true },
    { id: "lat-pulldown", name: "Lat Pulldown", type: "weight" },
    { id: "fastest-km", name: "Fastest KM", type: "time" },
    { id: "longest-distance", name: "Longest Distance Ran / Walked", type: "distance" },
    { id: "leg-extension", name: "Leg Extension", type: "weight" },
    { id: "chest-fly", name: "Chest Fly", type: "weight" },
    { id: "deadlift", name: "Deadlift", type: "weight", pr: true },
    { id: "incline-bench", name: "Incline Bench", type: "weight" },
    { id: "preacher-curl", name: "Preacher Curl", type: "weight" },
    { id: "pull-ups", name: "Pull Ups", type: "reps" },
    { id: "tricep-pushdown", name: "Tricep Pushdown", type: "weight" },
    { id: "reverse-machine-fly", name: "Reverse Machine Fly", type: "weight" },
    { id: "seated-row", name: "Seated Row", type: "weight" },
    { id: "shoulder-press", name: "Shoulder Press", type: "weight" },
    { id: "squat", name: "Squat", type: "weight", pr: true },
  ];
  const PR_EXERCISES = EXERCISES.filter((e) => e.pr);

  /* ---------------------------------------------------------------------
     POINTS SYSTEM
     Every night, for every exercise leaderboard:
       1st place  -> +5 points
       2nd place  -> +3 points
       3rd place  -> +1 point
       everyone else -> nothing
     These awarded points (not the raw weight/reps/time) are what rank
     the front-page leaderboard. First to XP_GOAL (100) wins the race.

     There's still no server that can run code at exactly midnight while
     nobody has a tab open, so this "catches up" the moment ANYONE loads
     the site after midnight has passed — see runDailyJob() below. With
     a shared database now, several friends could theoretically open the
     site at the same moment and race to run this; that's handled with a
     Firestore transaction so only one of them actually applies it.
  --------------------------------------------------------------------- */
  const PLACE_POINTS = { 1: 5, 2: 3, 3: 1 };

  function todayStr() {
    return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
  }

  function addDays(dateStr, n) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString("en-CA");
  }

  /* ---------------------------------------------------------------------
     FIREBASE SETUP
     If firebase-config.js still has its placeholder values, we deliberately
     don't call firebase.initializeApp() at all — every public method below
     rejects with a clear error instead of throwing a confusing crash, and
     nav.js shows a friendly on-page setup message.
  --------------------------------------------------------------------- */
  const FIREBASE_READY =
    typeof firebase !== "undefined" &&
    typeof FIREBASE_CONFIG !== "undefined" &&
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.apiKey.indexOf("REPLACE_ME") === -1;

  let db = null;
  let auth = null;
  if (FIREBASE_READY) {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    auth = firebase.auth();
  }

  // Which signed-in person is allowed to delete other people's lift
  // entries (for removing fake submissions). Set your own email in
  // js/firebase-config.js — this is checked again on the server side by
  // the Firestore/Storage security rules, not just hidden in the UI.
  const ADMIN_EMAIL = typeof ADMIN_CONFIG !== "undefined" ? ADMIN_CONFIG.email : null;

  const NOT_CONFIGURED_ERR = new Error(
    "Firebase isn't configured yet — see README.md and js/firebase-config.js"
  );
  const NOT_SIGNED_IN_ERR = new Error("Not signed in");

  /* ---------------------------------------------------------------------
     AUTH STATE
     Firebase checks whether a session is already saved (from a previous
     visit) the moment the page loads, and reports back once via this
     listener — even if the answer is "nobody's signed in". Everything
     that needs to know "who is this" waits on authReadyPromise first.
  --------------------------------------------------------------------- */
  let authUser; // undefined = not resolved yet, null = signed out, object = signed in
  let resolveAuthReady;
  const authReadyPromise = new Promise((resolve) => (resolveAuthReady = resolve));
  if (FIREBASE_READY) {
    auth.onAuthStateChanged((user) => {
      authUser = user;
      resolveAuthReady();
    });
  }
  function waitForAuth() {
    return authReadyPromise.then(() => authUser);
  }

  function usersCol() {
    return db.collection("users");
  }
  function userRef(id) {
    return db.collection("users").doc(id);
  }
  function streaksCol() {
    return db.collection("streaks");
  }
  function metaRef() {
    return db.collection("meta").doc("state");
  }

  function normalizeUser(id, data) {
    return {
      id,
      username: data.username || "New Lifter",
      lifts: data.lifts || {},
      prLifts: data.prLifts || {},
      points: typeof data.points === "number" ? data.points : 0,
      notifications: Array.isArray(data.notifications) ? data.notifications : [],
      photoUrl: typeof data.photoUrl === "string" ? data.photoUrl : null,
    };
  }

  // Fetches every user doc once. Fine at friend-group scale — everything
  // else (rankings, points, streaks) is derived from this in memory,
  // same as the old localStorage version did.
  function getAllUsersRaw() {
    return usersCol()
      .get()
      .then((snap) => snap.docs.map((d) => normalizeUser(d.id, d.data())));
  }

  /* ---------------------------------------------------------------------
     RANKING HELPERS (shared by the leaderboard + overtake detection)
  --------------------------------------------------------------------- */
  // Regular weight-type sets are ranked by total volume (weight x reps).
  // PR entries (and everything else) don't carry a `reps` field, so this
  // just falls through to the raw value — one function correctly
  // handles both regular sets and true 1-rep maxes.
  function rankValueFor(exercise, entry) {
    if (exercise.type === "weight" && typeof entry.reps === "number") {
      return entry.value * entry.reps;
    }
    return entry.value;
  }

  function rankedEntriesFor(users, exercise, field) {
    field = field || "lifts";
    const rows = users
      .filter((u) => u[field] && u[field][exercise.id])
      .map((u) => ({
        userId: u.id,
        username: u.username,
        photoUrl: u.photoUrl,
        ...u[field][exercise.id],
      }));
    rows.sort((a, b) => {
      const av = rankValueFor(exercise, a);
      const bv = rankValueFor(exercise, b);
      return exercise.type === "time" ? av - bv : bv - av;
    });
    return rows;
  }

  function withPoints(users) {
    const list = users.map((u) => ({ ...u, totalPoints: u.points }));
    list.sort((a, b) => b.totalPoints - a.totalPoints);
    return list;
  }

  /* ---------------------------------------------------------------------
     NIGHTLY JOB
  --------------------------------------------------------------------- */
  function claimCatchUp(today) {
    // One small transaction just to decide WHO gets to run the catch-up,
    // so two friends opening the site at the same moment don't both
    // award points for the same missed nights.
    return db.runTransaction((tx) =>
      tx.get(metaRef()).then((snap) => {
        const lastRun = snap.exists ? snap.data().lastRun : null;
        if (lastRun && lastRun >= today) {
          return { claimed: false };
        }
        tx.set(metaRef(), { lastRun: today }, { merge: true });
        // First run ever (lastRun doesn't exist yet): rather than doing
        // nothing and forcing a full calendar day to pass before anyone
        // sees a single point, treat "yesterday" as the starting line so
        // today's current standings earn their first night's points
        // immediately.
        return { claimed: true, from: lastRun || addDays(today, -1) };
      })
    );
  }

  function applyCatchUp(fromDate, toDate) {
    return Promise.all([getAllUsersRaw(), streaksCol().get()]).then(
      ([users, streakSnap]) => {
        const streaks = {};
        streakSnap.forEach((d) => (streaks[d.id] = d.data()));

        const pointsDelta = {}; // userId -> total points earned this catch-up

        // Awards one night's points/streak update for one exercise's
        // leaderboard. `streakKey` and `multiplier` let this same logic
        // serve both the regular boards (key = exercise id, x1) and the
        // separate PR boards (key = "pr-"+id, x2, reading from prLifts).
        function processNight(ex, field, streakKey, multiplier) {
          const ranked = rankedEntriesFor(users, ex, field);
          const leaderId = ranked[0] ? ranked[0].userId : null;

          ranked.slice(0, 3).forEach((row, i) => {
            const awarded = PLACE_POINTS[i + 1];
            if (!awarded) return;
            pointsDelta[row.userId] = (pointsDelta[row.userId] || 0) + awarded * multiplier;
          });

          const prev = streaks[streakKey] || { leaderId: null, streakDays: 0 };
          if (leaderId && leaderId === prev.leaderId) {
            streaks[streakKey] = { leaderId, streakDays: prev.streakDays + 1 };
          } else if (leaderId) {
            streaks[streakKey] = { leaderId, streakDays: 1 };
          } else {
            streaks[streakKey] = { leaderId: null, streakDays: 0 };
          }
        }

        let cursor = fromDate;
        while (cursor < toDate) {
          EXERCISES.forEach((ex) => processNight(ex, "lifts", ex.id, 1));
          PR_EXERCISES.forEach((ex) => processNight(ex, "prLifts", "pr-" + ex.id, 2));
          cursor = addDays(cursor, 1);
        }

        const batch = db.batch();
        Object.entries(pointsDelta).forEach(([uid, delta]) => {
          batch.update(userRef(uid), {
            points: firebase.firestore.FieldValue.increment(delta),
          });
        });
        Object.entries(streaks).forEach(([key, s]) => {
          batch.set(streaksCol().doc(key), s);
        });
        return batch.commit();
      }
    );
  }

  // Shared by logLift and logPR — both just call this against a
  // different data field ("lifts" vs "prLifts") and a different
  // notification label. Deferred to run after CHUDS_DB is fully built,
  // so referencing it directly here (not via `this`) is safe.
  function logEntryInternal(ex, value, meta, field, boardLabel) {
    return CHUDS_DB.getCurrentUser().then((me) => {
      const existing = (me[field] || {})[ex.id];
      const candidateEntry = { value, reps: field === "lifts" && ex.type === "weight" ? meta.reps : undefined };
      const newRankVal = rankValueFor(ex, candidateEntry);
      const isBetter =
        !existing ||
        (ex.type === "time" ? newRankVal < rankValueFor(ex, existing) : newRankVal > rankValueFor(ex, existing));

      if (!isBetter) return { saved: false, best: existing };

      return getAllUsersRaw().then((users) => {
        const oldRanked = rankedEntriesFor(users, ex, field);
        const oldRankOf = {};
        oldRanked.forEach((row, i) => (oldRankOf[row.userId] = i));

        const entry = {
          value,
          unit: meta.unit || "",
          date: new Date().toISOString(),
          proofName: meta.proofName || null,
          secondaryValue: meta.secondaryValue || null,
          secondaryUnit: meta.secondaryUnit || null,
        };
        if (field === "lifts" && ex.type === "weight") {
          entry.reps = meta.reps;
        }

        const updatedUsers = users.map((u) =>
          u.id === me.id ? { ...u, [field]: { ...u[field], [ex.id]: entry } } : u
        );
        const newRanked = rankedEntriesFor(updatedUsers, ex, field);

        const batch = db.batch();
        batch.update(userRef(me.id), { [`${field}.${ex.id}`]: entry });

        newRanked.forEach((row, newIdx) => {
          if (row.userId === me.id) return;
          const oldIdx = oldRankOf[row.userId];
          if (oldIdx !== undefined && newIdx > oldIdx) {
            const notif = {
              id: "n_" + Math.random().toString(36).slice(2, 9),
              message: `${me.username} overtook you on the ${ex.name}${boardLabel} leaderboard \u2014 you're now #${
                newIdx + 1
              }.`,
              exerciseId: ex.id,
              date: new Date().toISOString(),
              read: false,
            };
            batch.update(userRef(row.userId), {
              notifications: firebase.firestore.FieldValue.arrayUnion(notif),
            });
          }
        });

        return batch.commit().then(() => ({ saved: true, best: entry }));
      });
    });
  }

  /* ---------------------------------------------------------------------
     PUBLIC API — every function returns a Promise.
  --------------------------------------------------------------------- */
  return {
    XP_GOAL,
    isConfigured: FIREBASE_READY,

    runDailyJob() {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      const today = todayStr();
      return metaRef()
        .get()
        .then((snap) => {
          const lastRun = snap.exists ? snap.data().lastRun : null;
          if (lastRun && lastRun >= today) return; // already up to date
          return claimCatchUp(today).then((result) => {
            if (!result.claimed) return; // someone else is handling it
            return applyCatchUp(result.from, today);
          });
        });
    },

    getExercises() {
      return Promise.resolve(EXERCISES);
    },

    getExercise(id) {
      return Promise.resolve(EXERCISES.find((e) => e.id === id) || null);
    },

    isSignedIn() {
      if (!FIREBASE_READY) return Promise.resolve(false);
      return waitForAuth().then((u) => !!u);
    },

    // Raw signed-in email, straight from Firebase Auth — useful for
    // visibly confirming it matches ADMIN_CONFIG.email exactly, without
    // needing the browser console.
    getCurrentAuthEmail() {
      if (!FIREBASE_READY) return Promise.resolve(null);
      return waitForAuth().then((u) => (u ? u.email : null));
    },

    isAdmin() {
      if (!FIREBASE_READY || !ADMIN_EMAIL) return Promise.resolve(false);
      return waitForAuth().then(
        (u) => !!u && !!u.email && u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
      );
    },

    // Admin-only testing tool: rewinds the "last run" checkpoint back one
    // day, then runs the normal job — awarding tonight's points/streaks
    // immediately based on CURRENT standings, instead of waiting for a
    // real midnight to pass. Safe to call, but calling it twice in the
    // same day awards that night's points twice — it's a manual override,
    // not something to click repeatedly.
    forceRunNightlyJob() {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      return this.isAdmin().then((admin) => {
        if (!admin) return Promise.reject(new Error("Only the site admin can do that."));
        return metaRef()
          .set({ lastRun: addDays(todayStr(), -1) }, { merge: true })
          .then(() => this.runDailyJob());
      });
    },

    // Creates a real account (Firebase Authentication) plus their profile
    // document, in one go. This is the identity that now follows a person
    // across any device or browser they sign into.
    signUp(email, password, username) {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      return auth.createUserWithEmailAndPassword(email, password).then((cred) => {
        const fresh = {
          username: (username || "New Lifter").slice(0, 24),
          lifts: {},
          points: 0,
          notifications: [],
        };
        return userRef(cred.user.uid)
          .set(fresh)
          .then(() => normalizeUser(cred.user.uid, fresh));
      });
    },

    signIn(email, password) {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      return auth.signInWithEmailAndPassword(email, password);
    },

    signOut() {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      return auth.signOut();
    },

    getCurrentUser() {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      return waitForAuth().then((user) => {
        if (!user) return Promise.reject(NOT_SIGNED_IN_ERR);
        return userRef(user.uid)
          .get()
          .then((snap) => {
            if (snap.exists) return normalizeUser(snap.id, snap.data());
            // Safety net: an auth account exists but its profile doc
            // doesn't (shouldn't normally happen, since signUp creates
            // both together) — create one so the app doesn't break.
            const fresh = { username: "New Lifter", lifts: {}, points: 0, notifications: [] };
            return userRef(user.uid)
              .set(fresh)
              .then(() => normalizeUser(user.uid, fresh));
          });
      });
    },

    setCurrentUsername(username) {
      return this.getCurrentUser().then((me) => {
        const val = (username || me.username).slice(0, 24);
        return userRef(me.id)
          .update({ username: val })
          .then(() => ({ ...me, username: val }));
      });
    },

    // dataUrl is a compressed base64 image string (e.g. "data:image/jpeg;base64,...")
    // already resized/compressed client-side — see account.js. Stored as a
    // plain Firestore field since Storage isn't set up (no billing card
    // linked). Kept deliberately small: this field gets fetched along with
    // EVERY user, on every leaderboard load, not just when it's displayed.
    setProfilePhoto(dataUrl) {
      if (dataUrl && dataUrl.length > 300000) {
        return Promise.reject(new Error("That image is too large — try a smaller photo."));
      }
      return this.getCurrentUser().then((me) =>
        userRef(me.id)
          .update({ photoUrl: dataUrl || null })
          .then(() => ({ ...me, photoUrl: dataUrl || null }))
      );
    },

    getAllUsersWithPoints() {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      return getAllUsersRaw().then(withPoints);
    },

    getTopUsers(limit = 10) {
      return this.getAllUsersWithPoints().then((all) => all.slice(0, limit));
    },

    getUserRank(userId) {
      return this.getAllUsersWithPoints().then((all) => {
        const idx = all.findIndex((u) => u.id === userId);
        return idx === -1 ? null : idx + 1;
      });
    },

    // Public read of one specific person's profile (any signed-in visitor
    // can view anyone's — that's what powers the "click a username" page).
    getUserProfile(userId) {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      return userRef(userId)
        .get()
        .then((snap) => {
          if (!snap.exists) return null;
          const u = normalizeUser(snap.id, snap.data());
          return { ...u, totalPoints: u.points };
        });
    },

    getRaceLeaders(limit = 6) {
      return this.getAllUsersWithPoints().then((all) => all.slice(0, limit));
    },

    getExerciseLeaderboard(exerciseId, limit = 10) {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      const ex = EXERCISES.find((e) => e.id === exerciseId);
      if (!ex) return Promise.resolve([]);
      return getAllUsersRaw().then((users) => rankedEntriesFor(users, ex).slice(0, limit));
    },

    // #1 streak info for one exercise: { leaderId, leaderUsername, streakDays }
    getStreak(exerciseId) {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      return streaksCol()
        .doc(exerciseId)
        .get()
        .then((snap) => {
          if (!snap.exists || !snap.data().leaderId) return null;
          const s = snap.data();
          return userRef(s.leaderId)
            .get()
            .then((userSnap) => ({
              leaderId: s.leaderId,
              leaderUsername: userSnap.exists ? userSnap.data().username : "Unknown",
              streakDays: s.streakDays,
            }));
        });
    },

    getNotifications() {
      return this.getCurrentUser().then((me) =>
        (me.notifications || [])
          .slice()
          .sort((a, b) => new Date(b.date) - new Date(a.date))
      );
    },

    markNotificationsRead() {
      return this.getCurrentUser().then((me) => {
        const updated = (me.notifications || []).map((n) => ({ ...n, read: true }));
        return userRef(me.id)
          .update({ notifications: updated })
          .then(() => {});
      });
    },

    // Log (or overwrite-if-better) a lift for the current user.
    // Anyone this pushes down the rankings gets an "overtaken" notification.
    // meta.proofName is optional — proof is filename-only for now (not an
    // uploaded file), so this is just a label, not something viewable.
    // For weight-type exercises meta.reps (1-12) is required — the
    // leaderboard ranks by total volume (weight x reps).
    logLift(exerciseId, value, meta = {}) {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      const ex = EXERCISES.find((e) => e.id === exerciseId);
      if (!ex) return Promise.reject(new Error("Unknown exercise"));
      return logEntryInternal(ex, value, meta, "lifts", "");
    },

    // Same idea, but for the separate true-1-rep-max PR boards (bench,
    // deadlift, leg press, squat only) — always a single rep, no volume
    // math, and worth double points on the nightly job.
    logPR(exerciseId, value, meta = {}) {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      const ex = PR_EXERCISES.find((e) => e.id === exerciseId);
      if (!ex) return Promise.reject(new Error("That's not a PR exercise."));
      return logEntryInternal(ex, value, meta, "prLifts", " PR");
    },

    getPRExercises() {
      return Promise.resolve(PR_EXERCISES);
    },

    getPRLeaderboard(exerciseId, limit = 10) {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      const ex = PR_EXERCISES.find((e) => e.id === exerciseId);
      if (!ex) return Promise.resolve([]);
      return getAllUsersRaw().then((users) => rankedEntriesFor(users, ex, "prLifts").slice(0, limit));
    },

    getPRStreak(exerciseId) {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      return streaksCol()
        .doc("pr-" + exerciseId)
        .get()
        .then((snap) => {
          if (!snap.exists || !snap.data().leaderId) return null;
          const s = snap.data();
          return userRef(s.leaderId)
            .get()
            .then((userSnap) => ({
              leaderId: s.leaderId,
              leaderUsername: userSnap.exists ? userSnap.data().username : "Unknown",
              streakDays: s.streakDays,
            }));
        });
    },

    // Admin-only: removes a specific person's lift from one exercise
    // (e.g. a faked submission). Enforced again by the Firestore rules,
    // not just this check.
    deleteLift(userId, exerciseId) {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      return this.isAdmin().then((admin) => {
        if (!admin) return Promise.reject(new Error("Only the site admin can do that."));
        return userRef(userId)
          .update({ [`lifts.${exerciseId}`]: firebase.firestore.FieldValue.delete() })
          .then(() => {});
      });
    },

    // Same, but for a PR-board submission.
    deletePRLift(userId, exerciseId) {
      if (!FIREBASE_READY) return Promise.reject(NOT_CONFIGURED_ERR);
      return this.isAdmin().then((admin) => {
        if (!admin) return Promise.reject(new Error("Only the site admin can do that."));
        return userRef(userId)
          .update({ [`prLifts.${exerciseId}`]: firebase.firestore.FieldValue.delete() })
          .then(() => {});
      });
    },
  };
})();
