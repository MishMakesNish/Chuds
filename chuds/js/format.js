/* CHUDS — format.js (shared display helpers) */

function formatSeconds(totalSeconds) {
  const s = Math.round(totalSeconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

// Returns { big, small } strings for a lift entry, e.g. { big: "40x12", small: "kg" }
function formatLiftValue(exercise, entry) {
  switch (exercise.type) {
    case "weight":
      // Regular sets carry a reps count and show as "weightxreps" since
      // the leaderboard ranks by total volume. PR entries (true 1-rep
      // maxes, logged via Log PR) have no reps field, so they just show
      // the raw weight.
      if (typeof entry.reps === "number") {
        return { big: `${entry.value}x${entry.reps}`, small: "kg" };
      }
      return { big: entry.value, small: "kg" };
    case "reps":
      return { big: entry.value, small: "reps" };
    case "time":
      return { big: formatSeconds(entry.value), small: "min" };
    case "distance": {
      const timePart = entry.secondaryValue
        ? ` in ${formatSeconds(entry.secondaryValue)}`
        : "";
      return { big: entry.value, small: `km${timePart}` };
    }
    default:
      return { big: entry.value, small: "" };
  }
}
