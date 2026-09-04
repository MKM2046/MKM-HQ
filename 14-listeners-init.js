// ============================================================
// 14-listeners-init.js  –  Bootstrap & Form Listeners
// ============================================================

/* ── Global auth state listener ── */
supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log("[MKM] Auth event:", event);
    if (event === "SIGNED_OUT") {
        currentUser = null;
        currentProfile = null;
        showPage("landing");
    } else if (session?.user) {
        currentUser = session.user;
    }
});

/* ── Main initialisation ── */
function initMKM() {
    console.log("[MKM] initMKM() running");

    /* ---- Forms ---- */
    const signupForm = document.getElementById("signup-form");
    signupForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        console.log("[MKM] Sign-up submit intercepted");
        const username = document.getElementById("username").value.trim();
        const email    = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        await register(username, email, password);
    });

    const loginForm = document.getElementById("login-form");
    loginForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        console.log("[MKM] Login submit intercepted");
        const email    = document.getElementById("login-email").value.trim();
        const password = document.getElementById("login-password").value;
        await login(email, password);
    });

    /* ---- Inputs / helpers ---- */
    document.getElementById("trade-shares")?.addEventListener("input", updateTradePreview);

    const companyCategory = document.getElementById("company-category");
    companyCategory?.addEventListener("change", updateCompanyFormForCategory);
    updateCompanyFormForCategory();

    document.getElementById("establish-form")?.addEventListener("submit", submitCompanyRequest);
    document.getElementById("redeem-code-form")?.addEventListener("submit", createRedemptionCode);

    document.getElementById("redeem-code-input")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); redeemCode(); }
    });
    document.getElementById("people-search")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); searchPeople(); }
    });
    document.getElementById("chat-input")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); sendChatMessage(); }
    });

    /* ---- Session check & market timer ---- */
    checkSession().then(() => startMarketTimer());
}

/* ── Fire init immediately if DOM is already ready,
      otherwise wait for DOMContentLoaded ── */
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMKM);
} else {
    initMKM();
}

/* ============================================================
   HELPERS
   ============================================================ */

function setText(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = value;
}

function getTrendColor(value) {
    const n = Number(value || 0);
    if (n > 0) return "#22c55e";
    if (n < 0) return "#ef4444";
    return "#94a3b8";
}

function applyTrendStyle(element, value) {
    if (!element) return;
    const n = Number(value || 0);
    element.classList.remove("positive", "negative", "neutral");
    element.classList.add(n > 0 ? "positive" : n < 0 ? "negative" : "neutral");
    element.style.color = getTrendColor(n);
    element.style.fontWeight = "700";
}

function formatMoney(value) {
    return new Intl.NumberFormat("en-GB", {
        style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(Number(value || 0));
}

function formatSignedMoney(value) {
    const n = Number(value || 0);
    return n > 0 ? `+${formatMoney(n)}` : formatMoney(n);
}

function formatPercent(value) {
    return `${Number(value || 0).toFixed(2)}%`;
}

function formatSignedPercent(value) {
    const n = Number(value || 0);
    return n > 0 ? `+${n.toFixed(2)}%` : `${n.toFixed(2)}%`;
}

function formatNumber(value) {
    return new Intl.NumberFormat("en-GB").format(Number(value || 0));
}

function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

function formatDateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(d);
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}