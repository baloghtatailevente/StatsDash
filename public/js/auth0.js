function getSessionId() { return localStorage.getItem("sessionId"); }

console.log("[AUTH] All systems working!")

async function apiFetch(url, options = {}) {
  const sessionId = getSessionId();
  options.headers = options.headers || {};
  if (sessionId) options.headers.Authorization = sessionId;
  if (options.body && !(options.body instanceof FormData))
    options.headers["Content-Type"] = "application/json";

  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "API error");
  return data;
}

async function logout() {
  const sessionId = getSessionId();
  try {
    if (sessionId) await fetch("/api/logout", { method: "POST", headers: { Authorization: sessionId } });
  } catch (_) {}
  localStorage.removeItem("sessionId");
  window.location.href = "/";
}

function applyPermissions(rank) {
  document.querySelectorAll(".perm-0, .perm-1, .perm-99").forEach(el => el.style.display = "");
  if (rank === 0)
    document.querySelectorAll(".perm-1, .perm-99").forEach(el => el.style.display = "none");
  else if (rank === 1)
    document.querySelectorAll(".perm-0, .perm-99").forEach(el => el.style.display = "none");
  else if (rank === 99)
    document.querySelectorAll(".perm-0, .perm-1").forEach(el => el.style.display = "none");
}

(async function initUser0() {
  const sessionId = getSessionId();
  if (!sessionId) return (window.location.href = "/");

  try {
    const user = await apiFetch("/api/me");
    window.currentUser = user;

    if (user.rank !== 0) return (window.location.href = "/dashboard");

    applyPermissions(user.rank);

    const logoutBtn = document.getElementById("logout");
    if (logoutBtn) logoutBtn.addEventListener("click", logout);

    if (user.assigned_station) {
      const link = document.getElementById("station-link");
      if (link) link.href = `/dashboard/station?id=${user.assigned_station}`;
    }

  } catch (err) {
    console.error(err);
    logout();
  }
})();