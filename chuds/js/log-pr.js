/* CHUDS — log-pr.js */

document.addEventListener("DOMContentLoaded", () => {
  if (!ensureFirebaseConfigured()) return;

  ensureSignedIn().then((signedIn) => {
    if (!signedIn) return;

    renderTopbar("log-pr");

    const exerciseSelect = document.getElementById("exercise-select");
    const weightInput = document.getElementById("val-weight");
    const proofInput = document.getElementById("proof-input");
    const fileDropText = document.getElementById("file-drop-text");
    const form = document.getElementById("log-form");
    const statusMsg = document.getElementById("status-msg");

    let exercises = [];

    CHUDS_DB.getPRExercises().then((list) => {
      exercises = list;
      exerciseSelect.innerHTML =
        `<option value="" disabled selected>Choose an exercise&hellip;</option>` +
        list.map((ex) => `<option value="${ex.id}">${ex.name}</option>`).join("");
    });

    proofInput.addEventListener("change", () => {
      const file = proofInput.files[0];
      fileDropText.textContent = file
        ? `Attached: ${file.name}`
        : "Click to attach a video or photo of the lift (optional)";
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      statusMsg.className = "status-msg";

      const ex = exercises.find((e2) => e2.id === exerciseSelect.value);
      if (!ex) {
        showStatus("Pick an exercise first.", "info");
        return;
      }

      const value = parseFloat(weightInput.value);
      if (isNaN(value) || value <= 0) {
        showStatus("Enter a valid weight before submitting.", "info");
        return;
      }

      const proofFile = proofInput.files[0] || null;
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      showStatus("Saving\u2026", "info");

      CHUDS_DB.logPR(ex.id, value, {
        unit: "kg",
        proofName: proofFile ? proofFile.name : null,
      }).then((result) => {
        submitBtn.disabled = false;
        if (result.saved) {
          showStatus(
            `New PR logged for ${ex.name}. Your ranking has been updated.`,
            "ok"
          );
          form.reset();
          exerciseSelect.value = "";
          fileDropText.textContent = "Click to attach a video or photo of the lift (optional)";
        } else {
          showStatus(
            `That's not better than your current PR for ${ex.name}, so it wasn't saved.`,
            "info"
          );
        }
      }).catch((err) => {
        submitBtn.disabled = false;
        showStatus(err.message || "Something went wrong saving that PR.", "info");
      });
    });

    function showStatus(text, kind) {
      statusMsg.textContent = text;
      statusMsg.className = `status-msg status-msg--show status-msg--${kind}`;
    }
  });
});
