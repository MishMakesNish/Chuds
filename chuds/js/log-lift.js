/* CHUDS — log-lift.js */

document.addEventListener("DOMContentLoaded", () => {
  if (!ensureFirebaseConfigured()) return;

  ensureSignedIn().then((signedIn) => {
    if (!signedIn) return;

  renderTopbar("log-lift");

  const exerciseSelect = document.getElementById("exercise-select");
  const valueFields = document.getElementById("value-fields");
  const proofInput = document.getElementById("proof-input");
  const fileDropText = document.getElementById("file-drop-text");
  const form = document.getElementById("log-form");
  const statusMsg = document.getElementById("status-msg");

  let exercises = [];

  CHUDS_DB.getExercises().then((list) => {
    exercises = list;
    exerciseSelect.innerHTML =
      `<option value="" disabled selected>Choose an exercise&hellip;</option>` +
      list.map((ex) => `<option value="${ex.id}">${ex.name}</option>`).join("");
    renderValueFields(null);
  });

  exerciseSelect.addEventListener("change", () => {
    const ex = exercises.find((e) => e.id === exerciseSelect.value);
    renderValueFields(ex);
  });

  proofInput.addEventListener("change", () => {
    const file = proofInput.files[0];
    fileDropText.textContent = file
      ? `Attached: ${file.name}`
      : "Click to attach a video or photo of the lift (optional)";
  });

  function renderValueFields(ex) {
    if (!ex) {
      valueFields.innerHTML = "";
      return;
    }

    if (ex.type === "weight") {
      valueFields.innerHTML = `
        <div class="field-row">
          <div class="field">
            <label for="val-weight">Weight per rep (kg)</label>
            <input id="val-weight" type="number" min="0" step="0.5" required />
          </div>
          <div class="field">
            <label for="val-reps">Reps</label>
            <input id="val-reps-weight" type="number" min="1" max="12" step="1" required />
          </div>
        </div>
        <p class="help-text" style="margin-top:-12px;margin-bottom:20px;">Ranked by total volume — e.g. 40kg for 12 reps beats 50kg for 5 reps.</p>
      `;
    } else if (ex.type === "reps") {
      valueFields.innerHTML = `
        <div class="field">
          <label for="val-reps">Reps completed</label>
          <input id="val-reps" type="number" min="1" step="1" required />
        </div>
      `;
    } else if (ex.type === "time") {
      valueFields.innerHTML = `
        <div class="field">
          <label>Time</label>
          <div class="field-row">
            <input id="val-min" type="number" min="0" step="1" placeholder="Minutes" required />
            <input id="val-sec" type="number" min="0" max="59" step="1" placeholder="Seconds" required />
          </div>
        </div>
      `;
    } else if (ex.type === "distance") {
      valueFields.innerHTML = `
        <div class="field">
          <label for="val-distance">Distance (km)</label>
          <input id="val-distance" type="number" min="0" step="0.01" required />
        </div>
        <div class="field">
          <label>Time (optional)</label>
          <div class="field-row">
            <input id="val-min" type="number" min="0" step="1" placeholder="Minutes" />
            <input id="val-sec" type="number" min="0" max="59" step="1" placeholder="Seconds" />
          </div>
        </div>
      `;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    statusMsg.className = "status-msg";

    const ex = exercises.find((e2) => e2.id === exerciseSelect.value);
    if (!ex) {
      showStatus("Pick an exercise first.", "info");
      return;
    }

    let value = null;
    let unit = "";
    let reps = null;
    let secondaryValue = null;
    let secondaryUnit = null;

    if (ex.type === "weight") {
      value = parseFloat(document.getElementById("val-weight").value);
      reps = parseInt(document.getElementById("val-reps-weight").value, 10);
      unit = "kg";
    } else if (ex.type === "reps") {
      value = parseInt(document.getElementById("val-reps").value, 10);
      unit = "reps";
    } else if (ex.type === "time") {
      const min = parseFloat(document.getElementById("val-min").value) || 0;
      const sec = parseFloat(document.getElementById("val-sec").value) || 0;
      value = min * 60 + sec;
      unit = "sec";
    } else if (ex.type === "distance") {
      value = parseFloat(document.getElementById("val-distance").value);
      unit = "km";
      const min = parseFloat(document.getElementById("val-min").value) || 0;
      const sec = parseFloat(document.getElementById("val-sec").value) || 0;
      if (min || sec) {
        secondaryValue = min * 60 + sec;
        secondaryUnit = "sec";
      }
    }

    if (value === null || isNaN(value) || value <= 0) {
      showStatus("Enter a valid result before submitting.", "info");
      return;
    }
    if (ex.type === "weight" && (isNaN(reps) || reps < 1 || reps > 12)) {
      showStatus("Reps has to be a number between 1 and 12.", "info");
      return;
    }

    const proofFile = proofInput.files[0] || null;

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    showStatus("Saving\u2026", "info");

    CHUDS_DB.logLift(ex.id, value, {
      unit,
      reps,
      proofName: proofFile ? proofFile.name : null,
      secondaryValue,
      secondaryUnit,
    }).then((result) => {
      submitBtn.disabled = false;
      if (result.saved) {
        showStatus(
          `New personal best logged for ${ex.name}. Your ranking has been updated.`,
          "ok"
        );
        form.reset();
        exerciseSelect.value = "";
        valueFields.innerHTML = "";
        fileDropText.textContent = "Click to attach a video or photo of the lift (optional)";
      } else {
        showStatus(
          `That's not better than your current best for ${ex.name}, so it wasn't saved.`,
          "info"
        );
      }
    }).catch((err) => {
      submitBtn.disabled = false;
      showStatus(err.message || "Something went wrong saving that lift.", "info");
    });
  });

  function showStatus(text, kind) {
    statusMsg.textContent = text;
    statusMsg.className = `status-msg status-msg--show status-msg--${kind}`;
  }
  });
});
