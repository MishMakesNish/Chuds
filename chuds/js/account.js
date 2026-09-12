/* CHUDS — account.js */

document.addEventListener("DOMContentLoaded", () => {
  if (!ensureFirebaseConfigured()) return;

  ensureSignedIn().then((signedIn) => {
    if (!signedIn) return;

  const usernameInput = document.getElementById("username-input");
  const statRow = document.getElementById("stat-row");
  const liftList = document.getElementById("lift-list");
  const signOutBtn = document.getElementById("sign-out-btn");
  const photoInput = document.getElementById("photo-input");
  const photoDropZone = document.getElementById("photo-drop-zone");
  const photoDropText = document.getElementById("photo-drop-text");
  const avatarImg = document.getElementById("avatar-img");
  const avatarDefaultIcon = document.getElementById("avatar-default-icon");
  const usernameSavedMsg = document.getElementById("username-saved-msg");
  const adminPanel = document.getElementById("admin-panel");
  const forceRunBtn = document.getElementById("force-run-btn");
  const forceRunMsg = document.getElementById("force-run-msg");
  const photoStatusMsg = document.getElementById("photo-status-msg");
  const signedInAsEl = document.getElementById("signed-in-as");

  let currentUser = null;

  function load() {
    return Promise.all([
      CHUDS_DB.getCurrentUser(),
      CHUDS_DB.getExercises(),
    ]).then(([user, exercises]) => {
      currentUser = user;
      usernameInput.value = user.username;
      showAvatar(user.photoUrl);

      Promise.all([
        CHUDS_DB.getUserRank(user.id),
        CHUDS_DB.getAllUsersWithPoints(),
      ]).then(([rank, all]) => {
        const me = all.find((u) => u.id === user.id);
        statRow.innerHTML = `
          <div class="stat-pill"><strong>${me.totalPoints}</strong>total points</div>
          <div class="stat-pill"><strong>#${rank}</strong>current ranking</div>
          <div class="stat-pill"><strong>${
            Object.keys(user.lifts).length
          }</strong>lifts logged</div>
        `;
      });

      renderLifts(user, exercises);
    });
  }

  function showAvatar(photoUrl) {
    if (photoUrl) {
      avatarImg.src = photoUrl;
      avatarImg.style.display = "";
      avatarDefaultIcon.style.display = "none";
    } else {
      avatarImg.style.display = "none";
      avatarDefaultIcon.style.display = "";
    }
  }

  function renderLifts(user, exercises) {
    const entries = Object.entries(user.lifts);
    if (entries.length === 0) {
      liftList.innerHTML = `<div class="empty-state">No lifts yet. Head to "Log Lift" to add your first personal best.</div>`;
      return;
    }
    liftList.innerHTML = entries
      .map(([exId, entry]) => {
        const ex = exercises.find((e) => e.id === exId);
        if (!ex) return "";
        const { big, small } = formatLiftValue(ex, entry);
        return `
          <div class="lift-card">
            <div class="lift-card__name">${ex.name}</div>
            <div class="lift-card__value">${big}<span>${small}</span></div>
          </div>
        `;
      })
      .join("");
  }

  usernameInput.addEventListener("change", () => {
    const val = usernameInput.value.trim();
    if (!val) {
      usernameInput.value = currentUser.username;
      return;
    }
    CHUDS_DB.setCurrentUsername(val).then(() => {
      usernameSavedMsg.textContent = "Saved.";
      usernameSavedMsg.className = "status-msg status-msg--show status-msg--ok";
      return load();
    }).catch((err) => {
      usernameSavedMsg.textContent = err.message || "Couldn't save that — try again.";
      usernameSavedMsg.className = "status-msg status-msg--show status-msg--info";
    });
  });

  photoInput.addEventListener("change", () => {
    handlePhotoFile(photoInput.files[0]);
    photoInput.value = "";
  });

  ["dragenter", "dragover"].forEach((evt) => {
    photoDropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      photoDropZone.classList.add("file-drop--active");
    });
  });
  ["dragleave", "dragend"].forEach((evt) => {
    photoDropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      photoDropZone.classList.remove("file-drop--active");
    });
  });
  photoDropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    photoDropZone.classList.remove("file-drop--active");
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    handlePhotoFile(file);
  });

  function handlePhotoFile(file) {
    if (!file) return;
    showPhotoStatus("Reading photo\u2026", "info");
    if (!file.type || !file.type.startsWith("image/")) {
      showPhotoStatus("That doesn't look like an image file — pick or drop a photo instead.", "info");
      return;
    }
    resizeImageToDataUrl(file, 160)
      .then((dataUrl) => {
        showPhotoStatus("Saving\u2026", "info");
        return CHUDS_DB.setProfilePhoto(dataUrl);
      })
      .then(() => {
        showPhotoStatus("Photo updated.", "ok");
        return load();
      })
      .catch((err) => {
        showPhotoStatus(err.message || "Couldn't update your photo — see error above.", "info");
      });
  }

  function showPhotoStatus(text, kind) {
    photoStatusMsg.textContent = text;
    photoStatusMsg.className = `status-msg status-msg--show status-msg--${kind}`;
  }

  signOutBtn.addEventListener("click", () => {
    CHUDS_DB.signOut().then(() => window.location.reload());
  });

  CHUDS_DB.getCurrentAuthEmail().then((email) => {
    signedInAsEl.textContent = email ? `Signed in as: ${email}` : "";
  });

  CHUDS_DB.isAdmin().then((isAdmin) => {
    if (!isAdmin) return;
    adminPanel.style.display = "";
    forceRunBtn.addEventListener("click", () => {
      forceRunBtn.disabled = true;
      forceRunMsg.textContent = "Running\u2026";
      forceRunMsg.className = "status-msg status-msg--show status-msg--info";
      CHUDS_DB.forceRunNightlyJob().then(() => {
        forceRunBtn.disabled = false;
        forceRunMsg.textContent = "Done \u2014 points and streaks updated based on current standings. Check the main page.";
        forceRunMsg.className = "status-msg status-msg--show status-msg--ok";
        return load();
      }).catch((err) => {
        forceRunBtn.disabled = false;
        forceRunMsg.textContent = err.message || "Something went wrong.";
        forceRunMsg.className = "status-msg status-msg--show status-msg--info";
      });
    });
  });

  renderTopbar("account").then(load);
  });
});

// Reads an image file, center-crops it square, shrinks it to `size`x`size`
// pixels, and returns a compressed JPEG data URL. Keeping this small
// matters — the photo gets fetched along with every user on every
// leaderboard load, not just when it's actually shown.
function resizeImageToDataUrl(file, size) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
