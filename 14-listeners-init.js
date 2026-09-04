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

    /* ---- Auth Forms ---- */
    document.getElementById("signup-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("username")?.value.trim();
        const email    = document.getElementById("email")?.value.trim();
        const password = document.getElementById("password")?.value;
        if (username && email && password) await register(username, email, password);
    });

    document.getElementById("login-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email    = document.getElementById("login-email")?.value.trim();
        const password = document.getElementById("login-password")?.value;
        if (email && password) await login(email, password);
    });

    /* ---- Trade ---- */
    document.getElementById("trade-shares")?.addEventListener("input", updateTradePreview);

    /* ---- Admin: Category-aware fields ---- */
    const companyCategory = document.getElementById("company-category");
    companyCategory?.addEventListener("change", updateCompanyFormForCategory);
    updateCompanyFormForCategory();

    /* ---- Admin: ADD COMPANY FORM (this was missing!) ---- */
    const companyForm = document.getElementById("company-form");
    if (companyForm) {
        companyForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (!currentUser || currentUser.id !== MKM_OWNER_ID) {
                alert("Admin access denied.");
                return;
            }

            const name     = document.getElementById("company-name")?.value.trim();
            const symbol   = document.getElementById("company-symbol")?.value.trim().toUpperCase();
            const category = document.getElementById("company-category")?.value;
            const price    = Number(document.getElementById("company-price")?.value);
            const sharesGroup = document.getElementById("company-shares-group");
            const shares   = (sharesGroup && sharesGroup.style.display === "none")
                ? 1
                : Number(document.getElementById("company-shares")?.value);

            const msg = document.getElementById("company-message");

            if (!name || !symbol || !category || !Number.isFinite(price) || price <= 0 || !Number.isInteger(shares) || shares <= 0) {
                if (msg) { msg.textContent = "Please enter valid company information."; msg.style.color = "#ef4444"; }
                return;
            }

            if (msg) { msg.textContent = "Adding company..."; msg.style.color = ""; }

            try {
                const now = new Date().toISOString();
                const { data, error } = await supabaseClient
                    .from("Assets")
                    .insert({
                        name, symbol, category, price,
                        previous_price: price,
                        day_open_price: price,
                        last_day_reset: now,
                        market_cap: price * shares,
                        volume: 0,
                        description: ""
                    })
                    .select()
                    .single();

                if (error) throw error;

                await recordPriceHistory(data.id, price, price);

                if (msg) { msg.textContent = "Company added successfully."; msg.style.color = "#22c55e"; }
                companyForm.reset();
                updateCompanyFormForCategory();
                await loadAdminAssets();

            } catch (err) {
                console.error("[Admin] Add company error:", err);
                if (msg) { msg.textContent = err.message || "Could not add company."; msg.style.color = "#ef4444"; }
            }
        });
    }

    /* ---- My Companies: Establish request ---- */
    document.getElementById("establish-form")?.addEventListener("submit", submitCompanyRequest);

    /* ---- Admin: Redemption code form ---- */
    document.getElementById("redeem-code-form")?.addEventListener("submit", createRedemptionCode);

    /* ---- Enter-key shortcuts ---- */
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

/* ── Fire init immediately if DOM is already ready ── */
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMKM);
} else {
    initMKM();
}

/* ============================================================
   HELPERS  (shared across all modules)
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

/* ============================================================
   PRICE HISTORY  (used by market-sim.js + admin approval)
   ============================================================ */

async function recordPriceHistory(assetId, price, previousPrice = null) {
    const close = Number(price);
    if (!Number.isFinite(close) || close <= 0) return;

    const previous = previousPrice === null ? close : Number(previousPrice);
    const open = (Number.isFinite(previous) && previous > 0) ? previous : close;
    const move = Math.abs(close - open);
    const wick = move * (0.06 + Math.random() * 0.18) || close * 0.001;

    const high = Math.max(open, close) + wick;
    const low  = Math.min(open, close) - wick;

    const { error } = await supabaseClient
        .from("PriceHistory")
        .insert({
            asset_id: assetId,
            price: close,
            open_price: open,
            high_price: high,
            low_price: low,
            close_price: close,
            recorded_at: new Date().toISOString()
        });

    if (error) console.error("Price history error:", error);
}