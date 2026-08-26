// Shared shell for logged-in customer pages: renders the sidebar,
// wires logout, and highlights the active nav item. One place to
// change nav instead of editing it inside seven HTML files.

const NX_NAV_ITEMS = [
  { href: "useraccount.html", label: "Dashboard", icon: "🏠" },
  { href: "Accountdetails.html", label: "Profile", icon: "👤" },
  { href: "tranfer.html", label: "Transfer Money", icon: "💸" },
  { href: "beneficiaries.html", label: "Beneficiaries", icon: "📇" },
  { href: "fixed-deposits.html", label: "Fixed Deposits", icon: "🏦" },
  { href: "statement.html", label: "Statement", icon: "📄" },
];

function nxRenderSidebar(mountId = "nx-sidebar-mount") {
  const mount = document.getElementById(mountId);
  if (!mount) return;
  const current = window.location.pathname.split("/").pop();

  const items = NX_NAV_ITEMS.map(item => `
    <a href="${item.href}" class="${current === item.href ? "active" : ""}">
      <span>${item.icon}</span> ${item.label}
    </a>
  `).join("");

  mount.innerHTML = `
    <div class="nx-brand"><span class="nx-mark">N</span> NEXUS Bank</div>
    ${items}
    <div class="nx-nav-spacer"></div>
    <button class="nx-nav-item nx-logout" id="nx-logout-btn">↩ Logout</button>
  `;

  document.getElementById("nx-logout-btn").addEventListener("click", nxLogout);
}

async function nxLogout() {
  try {
    await fetch("/logout", { method: "POST", credentials: "include" });
  } catch (e) { /* ignore network errors on logout */ }
  window.location.href = "userloginpage.html";
}

// Wrapper so every fetch to our own API remembers credentials:'include'
// and redirects to login on a 401 instead of failing silently.
async function nxApiFetch(path, options = {}) {
  const response = await fetch(path, { ...options, credentials: "include" });
  if (response.status === 401) {
    window.location.href = "userloginpage.html";
    throw new Error("Not authenticated");
  }
  return response;
}

function nxFormatCurrency(amount) {
  const n = Number(amount || 0);
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nxFormatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
