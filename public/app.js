async function refreshHealth() {
  const badge = document.getElementById("health");
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.status === "ok") {
      badge.textContent = `healthy · uptime ${data.uptimeSeconds}s`;
      badge.className = "badge badge--ok";
    } else {
      throw new Error("unexpected status");
    }
  } catch {
    badge.textContent = "unavailable";
    badge.className = "badge badge--err";
  }
}

async function sendEcho() {
  const input = document.getElementById("text");
  const result = document.getElementById("result");
  try {
    const res = await fetch("/api/echo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.value }),
    });
    const data = await res.json();
    result.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    result.textContent = `Error: ${err.message}`;
  }
}

document.getElementById("send").addEventListener("click", sendEcho);
document.getElementById("text").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendEcho();
});

refreshHealth();
setInterval(refreshHealth, 5000);
