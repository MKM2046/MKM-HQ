// ============================================================
// MKM Exchange - APP.JS
// ============================================================

// ------------------------------------------------------------
// SUPABASE
// ------------------------------------------------------------

const SUPABASE_URL = "https://yvrtjegyfschjflhmgwb.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_k8Rwx4wS7_VV-Iiqgt7wYg_W1IFh8P-";

const { createClient } = window.supabase;

const supabaseClient = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);


// ------------------------------------------------------------
// CONSTANTS
// ------------------------------------------------------------

const MKM_OWNER_ID =
    "dbba8502-f01b-4e86-aa42-aa5899ce771d";

const LICENSE_TIERS = {
    basic: {
        name: "Basic",
        price: 2500,
        slots: 1,
        maxShares: 100000,
        commissionRate: 0.2,
        weeklyFee: 100,
        establishmentFee: 5000
    },
    standard: {
        name: "Standard",
        price: 10000,
        slots: 3,
        maxShares: 1000000,
        commissionRate: 0.5,
        weeklyFee: 250,
        establishmentFee: 5000
    },
    enterprise: {
        name: "Enterprise",
        price: 50000,
        slots: 5,
        maxShares: 999999999,
        commissionRate: 1.0,
        weeklyFee: 500,
        establishmentFee: 5000
    }
};

const CATEGORY_MAP = {
    stock: "📈 Stocks",
    crypto: "🪙 Crypto",
    index: "📊 Indices",
    forex: "💱 Forex",
    bonds: "🏦 Bonds",
    commodity: "🛢️ Commodities"
};

function formatCategory(value) {
    const key = String(value || "").toLowerCase().trim();
    return CATEGORY_MAP[key] || key || "—";
}

let currentUser = null;
let currentProfile = null;
let currentAsset = null;

let marketAssets = [];
let currentMarketCategory = "all";

let chart = null;
let candleSeries = null;
let chartResizeObserver = null;
let chartCandles = [];

let currentChartPeriod = "1D";
let currentTradeSide = "buy";

let marketTimer = null;
let priceSubscription = null;

/* ------------------------------------------------------------
   CATEGORY MARKET BEHAVIOUR
   ------------------------------------------------------------ */

const CATEGORY_BEHAVIOUR = {
    crypto:    { volatility: 3.00, liquidityBase: 50,   drift: 0.0,  gapChance: 0.15 },
    stock:     { volatility: 1.00, liquidityBase: 1000, drift: 0.02, gapChance: 0.05 },
    forex:     { volatility: 0.25, liquidityBase: 5000, drift: 0.0,  gapChance: 0.02 },
    commodity: { volatility: 1.50, liquidityBase: 500,  drift: 0.0,  gapChance: 0.08 },
    bonds:     { volatility: 0.08, liquidityBase: 10000,drift: 0.0,  gapChance: 0.01 },
    index:     { volatility: 0.60, liquidityBase: 2000, drift: 0.01, gapChance: 0.03 }
};

function getCategoryBehaviour(category) {
    const key = String(category || "").toLowerCase().trim();
    return CATEGORY_BEHAVIOUR[key] || CATEGORY_BEHAVIOUR.stock;
}


// ------------------------------------------------------------
// PAGE MANAGEMENT
// ------------------------------------------------------------

function showPage(pageId) {

    document.querySelectorAll(".page").forEach(page => {
        page.classList.add("hidden");
    });

    const page = document.getElementById(pageId);

    if (page) {
        page.classList.remove("hidden");
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


// ------------------------------------------------------------
// AUTH
// ------------------------------------------------------------

async function register(username, email, password) {

    const message =
        document.getElementById("signup-message");

    if (message) {
        message.textContent = "Creating account...";
    }

    try {

        const {
            data,
            error
        } = await supabaseClient.auth.signUp({
            email,
            password
        });

        if (error) {
            throw error;
        }

        if (!data.user) {
            throw new Error("Account could not be created.");
        }

        const mkmId =
            generateMKMId();

        const {
            error: profileError
        } = await supabaseClient
            .from("Profiles")
            .insert({
                id: data.user.id,
                mkm_id: mkmId,
                username,
                display_name: username,
                bio: "",
                status: "active"
            });

        if (profileError) {
            throw profileError;
        }

        if (message) {
            message.textContent =
                "Account created. Check your email if confirmation is required.";
        }

        document
            .getElementById("signup-form")
            ?.reset();

    } catch (error) {

        console.error(error);

        if (message) {
            message.textContent =
                error.message || "Registration failed.";
        }
    }
}


function generateMKMId() {

    const random =
        Math.floor(
            100000 +
            Math.random() * 900000
        );

    return `MKM-${random}`;
}


async function login(email, password) {

    const message =
        document.getElementById("login-message");

    if (message) {
        message.textContent = "Logging in...";
    }

    try {

        const {
            data,
            error
        } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            throw error;
        }

        currentUser = data.user;

        await loadDashboard();

    } catch (error) {

        console.error(error);

        if (message) {
            message.textContent =
                error.message || "Login failed.";
        }
    }
}


async function logout() {

    const {
        error
    } = await supabaseClient.auth.signOut();

    if (error) {
        console.error("Logout error:", error);
    }

    currentUser = null;
    currentProfile = null;
    currentAsset = null;

    showPage("landing");
}


// ------------------------------------------------------------
// SESSION
// ------------------------------------------------------------

async function checkSession() {

    try {

        const {
            data,
            error
        } = await supabaseClient.auth.getSession();

        if (error) {
            console.error("Session error:", error);
            showPage("landing");
            return;
        }

        if (data.session) {

            currentUser =
                data.session.user;

            await loadDashboard();

        } else {

            showPage("landing");
        }

    } catch (error) {

        console.error(
            "Session check failed:",
            error
        );

        showPage("landing");
    }
}


// ------------------------------------------------------------
// DASHBOARD
// ------------------------------------------------------------

async function loadDashboard() {

    if (!currentUser) {

        const {
            data
        } = await supabaseClient.auth.getUser();

        if (!data.user) {
            showPage("landing");
            return;
        }

        currentUser = data.user;
    }

    const {
        data: profile,
        error
    } = await supabaseClient
        .from("Profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (error) {

        console.error(
            "Profile error:",
            error
        );

        return;
    }

    currentProfile = profile;

    if (!profile) {

        console.error(
            "No profile found for user."
        );

        return;
    }

    setText(
        "dashboard-username",
        profile.display_name ||
        profile.username ||
        "User"
    );

    setText(
        "dashboard-mkm-id",
        profile.mkm_id || "—"
    );

    setText(
        "balance",
        formatMoney(profile.balance || 0)
    );

    setText(
        "account-status",
        profile.status || "—"
    );

    setText(
        "account-username",
        profile.username || "—"
    );

    setText(
        "account-created",
        formatDate(profile.created_at)
    );

    setText(
        "account-license",
        profile.company_license ? "Licensed" : "None"
    );

    const licenseText = document.getElementById("dashboard-license-text");
    const tierButtons = document.getElementById("dashboard-tier-buttons");
    if (licenseText) {
        const tier = profile.license_tier;
        const slots = profile.license_slots || 0;
        const config = tier ? LICENSE_TIERS[tier] : null;
        if (config && slots > 0) {
            licenseText.innerHTML = `<span style="color:#22c55e;font-weight:700;">${config.name} License</span> — ${slots} slot(s)`;
            if (tierButtons) tierButtons.classList.remove("hidden");
        } else {
            licenseText.innerHTML = `Status: <span style="color:#94a3b8;">No license</span> — Choose a tier below.`;
            if (tierButtons) tierButtons.classList.remove("hidden");
        }
    }

    const portfolioValue =
        await calculatePortfolioValue();

    setText(
        "portfolio",
        formatMoney(portfolioValue.value)
    );

    setText(
        "pnl",
        formatSignedMoney(portfolioValue.pnl)
    );

    applyTrendStyle(
        document.getElementById("pnl"),
        portfolioValue.pnl
    );

    const adminButton =
        document.getElementById("admin-button");

    if (adminButton) {

        if (
            currentUser.id ===
            MKM_OWNER_ID
        ) {

            adminButton.classList.remove("hidden");

        } else {

            adminButton.classList.add("hidden");
        }
    }

    showPage("dashboard");
}


// ------------------------------------------------------------
// PORTFOLIO CALCULATIONS
// ------------------------------------------------------------

async function calculatePortfolioValue() {

    if (!currentUser) {

        return {
            value: 0,
            pnl: 0
        };
    }

    const {
        data: positions,
        error
    } = await supabaseClient
        .from("Portfolios")
        .select(`
            *,
            Assets (
                id,
                name,
                symbol,
                price
            )
        `)
        .eq("user_id", currentUser.id);

    if (error) {

        console.error(
            "Portfolio calculation error:",
            error
        );

        return {
            value: 0,
            pnl: 0
        };
    }

    let totalValue = 0;
    let totalPnl = 0;

    (positions || []).forEach(position => {

        const price =
            Number(position.Assets?.price || 0);

        const shares =
            Number(position.shares || 0);

        const average =
            Number(position.average_price || 0);

        totalValue += shares * price;
        totalPnl += shares * (price - average);
    });

    return {
        value: totalValue,
        pnl: totalPnl
    };
}


// ------------------------------------------------------------
// PORTFOLIO PAGE
// ------------------------------------------------------------

async function loadPortfolio() {

    if (!currentUser) {
        await checkSession();
        return;
    }

    const {
        data: profile
    } = await supabaseClient
        .from("Profiles")
        .select("balance")
        .eq("id", currentUser.id)
        .maybeSingle();

    const {
        data: positions,
        error
    } = await supabaseClient
        .from("Portfolios")
        .select(`
            *,
            Assets (
                id,
                name,
                symbol,
                price
            )
        `)
        .eq("user_id", currentUser.id)
        .order("created_at", {
            ascending: true
        });

    if (error) {

        console.error(error);

        setText(
            "portfolio-list",
            "Could not load portfolio."
        );

        showPage("portfolio-page");

        return;
    }

    setText(
        "portfolio-cash",
        formatMoney(profile?.balance || 0)
    );

    let totalValue = 0;
    let totalPnl = 0;

    const container =
        document.getElementById("portfolio-list");

    if (!container) {
        return;
    }

    if (!positions || positions.length === 0) {

        container.innerHTML =
            "<p>No positions yet.</p>";

    } else {

        container.innerHTML = "";

        positions.forEach(position => {

            const asset = position.Assets;

            if (!asset) {
                return;
            }

            const shares =
                Number(position.shares || 0);

            const average =
                Number(position.average_price || 0);

            const price =
                Number(asset.price || 0);

            const value =
                shares * price;

            const pnl =
                shares * (price - average);

            totalValue += value;
            totalPnl += pnl;

            const row =
                document.createElement("div");

            row.className = "market-row";

            row.innerHTML = `
                <div>
                    <strong>
                        ${escapeHTML(asset.name)}
                    </strong>

                    <span>
                        ${escapeHTML(asset.symbol)}
                    </span>
                </div>

                <div>
                    ${shares} shares
                </div>

                <div>
                    Avg. ${formatMoney(average)}
                </div>

                <div>
                    ${formatMoney(value)}
                </div>

                <div
                    class="${pnl >= 0 ? "positive" : "negative"}"
                    style="color:${getTrendColor(pnl)};font-weight:700;"
                >
                    ${formatSignedMoney(pnl)}
                </div>

                <button>
                    Trade
                </button>
            `;

            const button =
                row.querySelector("button");

            button?.addEventListener(
                "click",
                event => {
                    event.stopPropagation();
                    loadAssetDetail(asset.id);
                }
            );

            container.appendChild(row);
        });
    }

    setText(
        "portfolio-total-value",
        formatMoney(totalValue)
    );

    setText(
        "portfolio-total-pnl",
        formatSignedMoney(totalPnl)
    );

    applyTrendStyle(
        document.getElementById("portfolio-total-pnl"),
        totalPnl
    );

    showPage("portfolio-page");
}


// ------------------------------------------------------------
// TRANSACTIONS
// ------------------------------------------------------------

async function loadTransactions() {

    if (!currentUser) {
        await checkSession();
        return;
    }

    const {
        data: transactions,
        error
    } = await supabaseClient
        .from("Transactions")
        .select(`
            *,
            Assets (
                name,
                symbol
            )
        `)
        .eq("user_id", currentUser.id)
        .order("created_at", {
            ascending: false
        });

    const container =
        document.getElementById("transactions-list");

    if (!container) {
        return;
    }

    if (error) {

        console.error(error);

        container.innerHTML =
            "<p>Could not load transactions.</p>";

        showPage("transactions-page");

        return;
    }

    if (!transactions || transactions.length === 0) {

        container.innerHTML =
            "<p>No transactions yet.</p>";

        showPage("transactions-page");

        return;
    }

    container.innerHTML = "";

    transactions.forEach(transaction => {

        const row =
            document.createElement("div");

        row.className = "market-row";

        const side =
            String(
                transaction.side ||
                transaction.type ||
                ""
            ).toLowerCase();

        const sideClass =
            side === "buy"
                ? "positive"
                : side === "sell"
                    ? "negative"
                    : "";

        const sideColor =
            side === "buy"
                ? "#22c55e"
                : side === "sell"
                    ? "#ef4444"
                    : "#94a3b8";

        row.innerHTML = `
            <div>
                <strong>
                    ${escapeHTML(
                        transaction.Assets?.name ||
                        "Unknown asset"
                    )}
                </strong>

                <span>
                    ${escapeHTML(
                        transaction.Assets?.symbol ||
                        "—"
                    )}
                </span>
            </div>

            <div
                class="${sideClass}"
                style="color:${sideColor};font-weight:800;"
            >
                ${escapeHTML(side.toUpperCase())}
            </div>

            <div>
                ${Number(transaction.shares || 0)} shares
            </div>

            <div>
                ${formatMoney(transaction.price || 0)}
            </div>

            <div>
                ${formatMoney(transaction.total || 0)}
            </div>

            <div>
                ${formatDateTime(transaction.created_at)}
            </div>
        `;

        container.appendChild(row);
    });

    showPage("transactions-page");
}


// ============================================================
// PROFILE
// ============================================================

// ------------------------------------------------------------
// LOAD PROFILE
// ------------------------------------------------------------

async function loadProfile() {

    if (!currentUser) {

        const {
            data
        } = await supabaseClient.auth.getUser();

        if (!data.user) {
            showPage("landing");
            return null;
        }

        currentUser =
            data.user;
    }

    const {
        data: profile,
        error
    } = await supabaseClient
        .from("Profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (error) {

        console.error(
            "Load profile error:",
            error
        );

        return null;
    }

    if (!profile) {

        console.error(
            "Profile not found."
        );

        return null;
    }

    currentProfile =
        profile;

    renderProfile(profile);

    showPage("profile-page");

    return profile;
}


// ============================================================
// PROFILE EDITING + PROFILE PICTURE
// ============================================================

async function openProfileEditor() {

    if (!currentUser) {
        await checkSession();
    }

    if (!currentUser) {
        return;
    }

    if (!currentProfile) {
        await loadProfile();
    }

    if (!currentProfile) {
        return;
    }

    const editor =
        document.getElementById("profile-editor");

    const displayInput =
        document.getElementById(
            "profile-display-input"
        );

    const bioInput =
        document.getElementById(
            "profile-bio-input"
        );

    if (displayInput) {
        displayInput.value =
            currentProfile.display_name || "";
    }

    if (bioInput) {
        bioInput.value =
            currentProfile.bio || "";
    }

    editor?.classList.remove("hidden");
}


function closeProfileEditor() {

    document
        .getElementById("profile-editor")
        ?.classList.add("hidden");

    const message =
        document.getElementById(
            "profile-edit-message"
        );

    if (message) {
        message.textContent = "";
    }
}


async function saveProfile() {

    if (!currentUser) {
        return;
    }

    const displayInput =
        document.getElementById(
            "profile-display-input"
        );

    const bioInput =
        document.getElementById(
            "profile-bio-input"
        );

    const avatarInput =
        document.getElementById(
            "profile-avatar-input"
        );

    const message =
        document.getElementById(
            "profile-edit-message"
        );

    const displayName =
        displayInput?.value.trim() || "";

    const bio =
        bioInput?.value.trim() || "";

    if (!displayName) {

        if (message) {
            message.textContent =
                "Display name cannot be empty.";
        }

        return;
    }

    if (message) {
        message.textContent =
            "Saving profile...";
    }

    try {

        let avatarUrl =
            currentProfile?.avatar_url || null;


        // ----------------------------------------------------
        // PROFILE PICTURE
        // ----------------------------------------------------

        const file =
            avatarInput?.files?.[0];

        if (file) {

            const maxSize =
                5 * 1024 * 1024;

            if (file.size > maxSize) {

                throw new Error(
                    "Profile picture must be smaller than 5 MB."
                );
            }

            const allowedTypes = [
                "image/jpeg",
                "image/png",
                "image/webp"
            ];

            if (
                !allowedTypes.includes(
                    file.type
                )
            ) {

                throw new Error(
                    "Please use a JPG, PNG or WebP image."
                );
            }

            const extension =
                file.type === "image/png"
                    ? "png"
                    : file.type === "image/webp"
                        ? "webp"
                        : "jpg";

            const filePath =
                `${currentUser.id}/avatar.${extension}`;

            const {
                error: uploadError
            } = await supabaseClient
                .storage
                .from("profile-pictures")
                .upload(
                    filePath,
                    file,
                    {
                        upsert: true,
                        contentType: file.type,
                        cacheControl: "3600"
                    }
                );

            if (uploadError) {
                throw uploadError;
            }

            const {
                data: publicData
            } = supabaseClient
                .storage
                .from("profile-pictures")
                .getPublicUrl(filePath);

            avatarUrl =
                publicData?.publicUrl || null;
        }


        // ----------------------------------------------------
        // SAVE PROFILE
        // ----------------------------------------------------

        const {
            data: updatedProfile,
            error
        } = await supabaseClient
            .from("Profiles")
            .update({
                display_name: displayName,
                bio,
                avatar_url: avatarUrl
            })
            .eq(
                "id",
                currentUser.id
            )
            .select()
            .single();

        if (error) {
            throw error;
        }

        currentProfile =
            updatedProfile;


        // ----------------------------------------------------
        // UPDATE PROFILE DISPLAY
        // ----------------------------------------------------

        renderProfile(
            updatedProfile
        );

        if (message) {
            message.textContent =
                "Profile updated successfully.";
        }

        if (avatarInput) {
            avatarInput.value = "";
        }

        setTimeout(
            closeProfileEditor,
            800
        );

    } catch (error) {

        console.error(
            "Profile update error:",
            error
        );

        if (message) {
            message.textContent =
                error.message ||
                "Could not update profile.";
        }
    }
}


// ============================================================
// PROFILE RENDERING
// ============================================================

function renderProfile(profile) {

    if (!profile) {
        return;
    }

    setText(
        "profile-username",
        profile.username
            ? `@${profile.username}`
            : "@—"
    );

    setText(
        "profile-display-name",
        profile.display_name ||
        profile.username ||
        "—"
    );

    setText(
        "profile-mkm-id",
        profile.mkm_id ||
        "—"
    );

    setText(
        "profile-status",
        profile.status ||
        "Active"
    );

    setText(
        "profile-bio",
        profile.bio ||
        "No bio yet."
    );

    setText(
        "profile-created",
        formatDate(
            profile.created_at
        )
    );


    const avatar =
        document.getElementById(
            "profile-avatar"
        );

    const placeholder =
        document.getElementById(
            "profile-avatar-placeholder"
        );

    if (
        profile.avatar_url &&
        avatar
    ) {

        avatar.src =
            `${profile.avatar_url}?v=${Date.now()}`;

        avatar.classList.remove(
            "hidden"
        );

        placeholder?.classList.add(
            "hidden"
        );

    } else {

        avatar?.classList.add(
            "hidden"
        );

        if (placeholder) {

            placeholder.classList.remove(
                "hidden"
            );

            const name =
                profile.display_name ||
                profile.username ||
                "?";

            placeholder.textContent =
                name
                    .charAt(0)
                    .toUpperCase();
        }
    }
}


// ============================================================
// MARKET
// ============================================================

async function loadMarket() {

    const {
        data: assets,
        error
    } = await supabaseClient
        .from("Assets")
        .select("*")
        .eq("is_delisted", false)
        .order("market_cap", {
            ascending: false,
            nullsFirst: false
        });

    if (error) {

        console.error(
            "Market error:",
            error
        );

        return;
    }

    marketAssets = assets || [];

    renderMarket();

    showPage("market");
}


function renderMarket() {

    const searchInput =
        document.getElementById("market-search");

    const search =
        (searchInput?.value || "")
            .trim()
            .toLowerCase();

    let assets = [...marketAssets];

    if (currentMarketCategory !== "all") {

        assets =
            assets.filter(
                asset =>
                    String(asset.category || "")
                        .toLowerCase() ===
                    currentMarketCategory
            );
    }

    if (search) {

        assets =
            assets.filter(asset => {

                const name =
                    String(asset.name || "")
                        .toLowerCase();

                const symbol =
                    String(asset.symbol || "")
                        .toLowerCase();

                return (
                    name.includes(search) ||
                    symbol.includes(search)
                );
            });
    }

    renderMarketOverview(assets);
    renderMovers(assets);
    renderMarketList(assets);
}


function filterMarket(category) {

    currentMarketCategory = category;

    renderMarket();
}


function renderMarketOverview(assets) {

    setText(
        "market-asset-count",
        assets.length
    );

    const totalCap =
        assets.reduce(
            (sum, asset) =>
                sum +
                Number(asset.market_cap || 0),
            0
        );

    const totalVolume =
        assets.reduce(
            (sum, asset) =>
                sum +
                Number(asset.volume || 0),
            0
        );

    setText(
        "market-total-cap",
        formatMoney(totalCap)
    );

    setText(
        "market-total-volume",
        formatNumber(totalVolume)
    );
}


// ------------------------------------------------------------
// MOVERS
// ------------------------------------------------------------

function getAssetChange(asset) {

    const price =
        Number(asset.price || 0);

    const open =
        Number(asset.day_open_price || 0);

    /*
     * Only compare against the true day open price.
     * Falling back to previous_price produced meaningless
     * micro-movements (change from the last simulation tick).
     */
    if (open <= 0 || price <= 0) {
        return 0;
    }

    return (
        (price - open) /
        open
    ) * 100;
}


function renderMovers(assets) {

    const ranked =
        assets
            .map(asset => ({
                ...asset,
                change: getAssetChange(asset)
            }))
            .sort(
                (a, b) =>
                    b.change - a.change
            );

    const gainers =
        ranked
            .filter(asset => asset.change > 0)
            .slice(0, 5);

    const losers =
        ranked
            .filter(asset => asset.change < 0)
            .sort(
                (a, b) =>
                    a.change - b.change
            )
            .slice(0, 5);

    renderMoverList(
        "gainers-list",
        gainers
    );

    renderMoverList(
        "losers-list",
        losers
    );
}


function renderMoverList(
    elementId,
    assets
) {

    const container =
        document.getElementById(elementId);

    if (!container) {
        return;
    }

    if (!assets.length) {

        container.innerHTML =
            "<p>No movers.</p>";

        return;
    }

    container.innerHTML = "";

    assets.forEach(asset => {

        const change =
            Number(asset.change || 0);

        const color =
            getTrendColor(change);

        const colorClass =
            change > 0
                ? "positive"
                : change < 0
                    ? "negative"
                    : "neutral";

        const arrow =
            change > 0
                ? "▲"
                : change < 0
                    ? "▼"
                    : "—";

        const row =
            document.createElement("div");

        row.className = "mover-row";

        row.innerHTML = `
            <div>
                <strong>${escapeHTML(asset.symbol)}</strong>
                <span>${escapeHTML(asset.name)} · ${formatCategory(asset.category)}</span>
            </div>

            <div>
                <strong>
                    ${formatMoney(asset.price)}
                </strong>
            </div>

            <div
                class="${colorClass}"
                style="color:${color};font-weight:800;"
            >
                <strong>
                    ${arrow}
                    ${formatSignedPercent(change)}
                </strong>
            </div>
        `;

        row.addEventListener(
            "click",
            () => loadAssetDetail(asset.id)
        );

        container.appendChild(row);
    });
}


// ------------------------------------------------------------
// MARKET LIST
// ------------------------------------------------------------

function renderMarketList(assets) {

    const container =
        document.getElementById("market-list");

    if (!container) {
        return;
    }

    if (!assets.length) {

        container.innerHTML =
            "<p>No assets found.</p>";

        return;
    }

    container.innerHTML = "";

    assets.forEach(asset => {

        const price =
            Number(asset.price || 0);

        const change =
            getAssetChange(asset);

        const color =
            getTrendColor(change);

        const colorClass =
            change > 0
                ? "positive"
                : change < 0
                    ? "negative"
                    : "neutral";

        const arrow =
            change > 0
                ? "▲"
                : change < 0
                    ? "▼"
                    : "—";

        const row =
            document.createElement("div");

        row.className = "market-row";

        row.innerHTML = `
            <div>
                <strong>
                    ${escapeHTML(asset.name)}
                </strong>

                <span>
                    ${escapeHTML(asset.symbol)}
                </span>
            </div>

            <div>
                ${formatMoney(price)}
            </div>

            <div
                class="${colorClass}"
                style="color:${color};font-weight:800;"
            >
                ${arrow}
                ${formatSignedPercent(change)}
            </div>

            <div>
                ${formatMoney(asset.market_cap || 0)}
            </div>

            <div>
                ${formatNumber(asset.volume || 0)}
            </div>
        `;

        row.addEventListener(
            "click",
            () => loadAssetDetail(asset.id)
        );

        container.appendChild(row);
    });
}


// ------------------------------------------------------------
// MARKET SEARCH
// ------------------------------------------------------------

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const marketSearch =
            document.getElementById("market-search");

        if (marketSearch) {

            marketSearch.addEventListener(
                "input",
                renderMarket
            );
        }
    }
);


// ============================================================
// ASSET DETAIL
// ============================================================

async function loadAssetDetail(assetId) {

    const {
        data: asset,
        error
    } = await supabaseClient
        .from("Assets")
        .select("*")
        .eq("id", assetId)
        .maybeSingle();

    if (error) {

        console.error(error);
        return;
    }

    if (!asset) {

        alert("Asset not found.");

        return;
    }

    currentAsset = asset;

    setText("asset-name", asset.name);
    setText("asset-symbol", asset.symbol);
    setText("asset-category", formatCategory(asset.category));
    setText("asset-category-stat", formatCategory(asset.category));

    setText(
        "asset-price",
        formatMoney(asset.price)
    );

    setText(
        "trade-price",
        formatMoney(asset.price)
    );

    setText(
        "asset-market-cap",
        formatMoney(asset.market_cap || 0)
    );

    setText(
        "asset-volume",
        formatNumber(asset.volume || 0)
    );

    const volumeFill = document.getElementById("volume-fill");
    if (volumeFill) {
        const maxVolume = Math.max(asset.volume || 0, 1000000);
        const pct = Math.min(100, ((asset.volume || 0) / maxVolume) * 100);
        volumeFill.style.width = pct + "%";
    }

    setText(
        "asset-description",
        asset.description ||
        "No description available."
    );

    /* Delisted banner */
    const delistedBanner = document.getElementById("asset-delisted-banner");
    if (delistedBanner) {
        if (asset.is_delisted) {
            delistedBanner.classList.remove("hidden");
            delistedBanner.textContent =
                "⚠️ " + asset.name + " has been delisted. Trading is disabled.";
        } else {
            delistedBanner.classList.add("hidden");
            delistedBanner.textContent = "";
        }
    }

    /* Founder info */
    const founderInfo = document.getElementById("asset-founder-info");
    if (founderInfo) {
        if (asset.created_by_user_id) {
            founderInfo.classList.remove("hidden");
            founderInfo.innerHTML =
                'Founded by <span style="color:var(--green-bright);font-weight:700;">Company Founder</span>';
        } else {
            founderInfo.classList.add("hidden");
        }
    }

    updateAssetChange(asset);

    await loadTradePosition();

    /* Clean up old price subscription before opening new chart */
    if (priceSubscription) {
        try {
            supabaseClient.removeChannel(priceSubscription);
        } catch (e) { console.warn(e); }
        priceSubscription = null;
    }

    showPage("asset-detail");

    setTimeout(
        () => loadChart(),
        50
    );
}


// ------------------------------------------------------------
// ASSET CHANGE
// ------------------------------------------------------------

function updateAssetChange(asset) {

    const change =
        getAssetChange(asset);

    const element =
        document.getElementById("asset-change");

    if (!element) {
        return;
    }

    element.textContent =
        formatSignedPercent(change);

    applyTrendStyle(
        element,
        change
    );
}


// ============================================================
// TRADING
// ============================================================

function setTradeSide(side) {

    currentTradeSide = side;

    const buyTab =
        document.getElementById("buy-tab");

    const sellTab =
        document.getElementById("sell-tab");

    const submit =
        document.getElementById("trade-submit");

    if (side === "buy") {

        buyTab?.classList.add("active");
        sellTab?.classList.remove("active");

        submit?.classList.add("buy-mode");
        submit?.classList.remove("sell-mode");

        if (submit) {
            submit.textContent = "Buy";
        }

    } else {

        sellTab?.classList.add("active");
        buyTab?.classList.remove("active");

        submit?.classList.add("sell-mode");
        submit?.classList.remove("buy-mode");

        if (submit) {
            submit.textContent = "Sell";
        }
    }

    clearTradeMessage();

    updateTradePreview();
}


async function loadTradePosition() {

    if (!currentUser || !currentAsset) {
        return;
    }

    const {
        data: position,
        error
    } = await supabaseClient
        .from("Portfolios")
        .select("*")
        .eq("user_id", currentUser.id)
        .eq("asset_id", currentAsset.id)
        .maybeSingle();

    if (error) {

        console.error(
            "Position error:",
            error
        );

        return;
    }

    const shares =
        Number(position?.shares || 0);

    const average =
        Number(position?.average_price || 0);

    const price =
        Number(currentAsset.price || 0);

    const value =
        shares * price;

    const pnl =
        shares * (price - average);

    setText(
        "trade-holdings",
        formatNumber(shares)
    );

    setText(
        "position-shares",
        formatNumber(shares)
    );

    setText(
        "position-average",
        formatMoney(average)
    );

    setText(
        "position-value",
        formatMoney(value)
    );

    setText(
        "position-pnl",
        formatSignedMoney(pnl)
    );

    applyTrendStyle(
        document.getElementById("position-pnl"),
        pnl
    );

    await refreshTradeBalance();

    updateTradePreview();
}


async function refreshTradeBalance() {

    if (!currentUser) {
        return;
    }

    const {
        data: profile,
        error
    } = await supabaseClient
        .from("Profiles")
        .select("balance")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (error) {

        console.error(error);
        return;
    }

    if (currentProfile) {
        currentProfile.balance =
            profile?.balance || 0;
    }

    setText(
        "trade-balance",
        formatMoney(profile?.balance || 0)
    );
}


function updateTradePreview() {

    if (!currentAsset) {
        return;
    }

    const sharesInput =
        document.getElementById("trade-shares");

    const shares =
        Math.max(
            0,
            Number(sharesInput?.value || 0)
        );

    const price =
        Number(currentAsset.price || 0);

    const total =
        shares * price;

    setText(
        "trade-total",
        formatMoney(total)
    );

    setText(
        "trade-price",
        formatMoney(price)
    );
}


// ------------------------------------------------------------
// SUBMIT TRADE
// ------------------------------------------------------------

async function submitTrade() {

    if (!currentUser) {

        showTradeMessage(
            "You must be logged in.",
            true
        );

        return;
    }

    if (!currentAsset) {

        showTradeMessage(
            "No asset selected.",
            true
        );

        return;
    }

    const input =
        document.getElementById("trade-shares");

    const shares =
        Number(input?.value || 0);

    if (
        !Number.isInteger(shares) ||
        shares <= 0
    ) {

        showTradeMessage(
            "Enter a whole number of shares.",
            true
        );

        return;
    }

    const price =
        Number(currentAsset.price || 0);

    const total =
        shares * price;

    const action =
        currentTradeSide === "buy"
            ? "buy"
            : "sell";

    const confirmation =
        `Confirm ${action.toUpperCase()}?\n\n` +
        `${currentAsset.name} (${currentAsset.symbol})\n` +
        `${shares} shares\n` +
        `Price: ${formatMoney(price)}\n` +
        `Total: ${formatMoney(total)}`;

    if (!confirm(confirmation)) {
        return;
    }

    const submit =
        document.getElementById("trade-submit");

    if (submit) {

        submit.disabled = true;
        submit.textContent = "Processing...";
    }

    clearTradeMessage();

    try {

        const {
            data,
            error
        } = await supabaseClient.rpc(
            "execute_trade",
            {
                p_asset_id: currentAsset.id,
                p_side: currentTradeSide,
                p_shares: shares
            }
        );

        if (error) {
            throw error;
        }

        console.log("Trade result:", data);

        showTradeMessage(
            `${action === "buy" ? "Bought" : "Sold"} ${shares} share${shares === 1 ? "" : "s"} successfully.`,
            false
        );

        if (input) {
            input.value = 1;
        }

        await refreshCurrentAsset();
        await loadTradePosition();
        await loadDashboardDataOnly();

    } catch (error) {

        console.error(
            "Trade error:",
            error
        );

        let message =
            error.message ||
            "Trade failed.";

        const lowerMessage =
            message.toLowerCase();

        if (
            lowerMessage.includes(
                "insufficient balance"
            )
        ) {

            message =
                "Not enough paper balance for this trade.";

        } else if (
            lowerMessage.includes(
                "insufficient shares"
            )
        ) {

            message =
                "You do not own enough shares to sell.";

        } else if (
            lowerMessage.includes(
                "invalid side"
            )
        ) {

            message =
                "Invalid trade type.";
        }

        showTradeMessage(
            message,
            true
        );

    } finally {

        if (submit) {

            submit.disabled = false;

            submit.textContent =
                currentTradeSide === "buy"
                    ? "Buy"
                    : "Sell";
        }
    }
}


// ------------------------------------------------------------
// REFRESH CURRENT ASSET
// ------------------------------------------------------------

async function refreshCurrentAsset() {

    if (!currentAsset) {
        return;
    }

    const {
        data: asset,
        error
    } = await supabaseClient
        .from("Assets")
        .select("*")
        .eq("id", currentAsset.id)
        .maybeSingle();

    if (error) {

        console.error(error);
        return;
    }

    if (!asset) {
        return;
    }

    currentAsset = asset;

    setText(
        "asset-price",
        formatMoney(asset.price)
    );

    setText(
        "trade-price",
        formatMoney(asset.price)
    );

    setText(
        "asset-market-cap",
        formatMoney(asset.market_cap || 0)
    );

    setText(
        "asset-volume",
        formatNumber(asset.volume || 0)
    );

    const volumeFill = document.getElementById("volume-fill");
    if (volumeFill) {
        const maxVolume = Math.max(asset.volume || 0, 1000000);
        const pct = Math.min(100, ((asset.volume || 0) / maxVolume) * 100);
        volumeFill.style.width = pct + "%";
    }

    updateAssetChange(asset);
    updateTradePreview();

    /*
     * Only reload chart data — don't destroy the
     * entire chart instance on every tick.
     */
    if (
        chart &&
        candleSeries &&
        !document
            .getElementById("asset-detail")
            ?.classList.contains("hidden")
    ) {

        await loadChartData();
    }
}


// ------------------------------------------------------------
// DASHBOARD DATA ONLY
// ------------------------------------------------------------

async function loadDashboardDataOnly() {

    if (!currentUser) {
        return;
    }

    const {
        data: profile
    } = await supabaseClient
        .from("Profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (!profile) {
        return;
    }

    currentProfile = profile;

    setText(
        "balance",
        formatMoney(profile.balance || 0)
    );

    const portfolioValue =
        await calculatePortfolioValue();

    setText(
        "portfolio",
        formatMoney(portfolioValue.value)
    );

    setText(
        "pnl",
        formatSignedMoney(portfolioValue.pnl)
    );

    applyTrendStyle(
        document.getElementById("pnl"),
        portfolioValue.pnl
    );
}


// ------------------------------------------------------------
// TRADE MESSAGES
// ------------------------------------------------------------

function showTradeMessage(
    message,
    isError
) {

    const element =
        document.getElementById("trade-message");

    if (!element) {
        return;
    }

    element.textContent = message;

    element.classList.toggle(
        "negative",
        Boolean(isError)
    );

    element.classList.toggle(
        "positive",
        !isError
    );

    element.style.color =
        isError
            ? "#ef4444"
            : "#22c55e";
}


function clearTradeMessage() {

    const element =
        document.getElementById("trade-message");

    if (element) {

        element.textContent = "";

        element.classList.remove(
            "negative",
            "positive"
        );

        element.style.color = "";
    }
}


// ============================================================
// CHART
// ============================================================

async function loadChart() {

    const container =
        document.getElementById("price-chart");

    if (!container || !currentAsset) {
        return;
    }

    if (chartResizeObserver) {

        try {
            chartResizeObserver.disconnect();
        } catch (error) {
            console.warn(error);
        }

        chartResizeObserver = null;
    }

    if (chart) {

        try {
            chart.remove();
        } catch (error) {
            console.warn(
                "Could not remove previous chart:",
                error
            );
        }

        chart = null;
        candleSeries = null;
    }

    container.innerHTML = "";
    chartCandles = [];

    if (
        typeof LightweightCharts ===
        "undefined"
    ) {

        container.innerHTML =
            "<p>Chart library unavailable.</p>";

        return;
    }

    const containerHeight =
        container.clientHeight || 420;

    chart =
        LightweightCharts.createChart(
            container,
            {
                width:
                    container.clientWidth || 700,

                height: containerHeight,

                layout: {
                    background: {
                        color: "transparent"
                    },

                    textColor: "#9ca3af"
                },

                grid: {
                    vertLines: {
                        color:
                            "rgba(128,128,128,0.12)"
                    },

                    horzLines: {
                        color:
                            "rgba(128,128,128,0.12)"
                    }
                },

                localization: {
                    locale:
                        navigator.language || "en-GB"
                },

                rightPriceScale: {
                    borderColor:
                        "rgba(128,128,128,0.25)"
                },

                timeScale: {
                    borderColor:
                        "rgba(128,128,128,0.25)",

                    timeVisible: true,

                    secondsVisible: false,

                    rightOffset: 6,

                    barSpacing: 10
                },

                crosshair: {
                    mode: 1
                },

                handleScroll: {
                    mouseWheel: true,
                    pressedMouseMove: true,
                    horzTouchDrag: true,
                    vertTouchDrag: true
                },

                handleScale: {
                    axisPressedMouseMove: true,
                    mouseWheel: true,
                    pinch: true
                }
            }
        );

    candleSeries =
        chart.addSeries(
            LightweightCharts.CandlestickSeries,
            {
                upColor: "#22c55e",
                downColor: "#ef4444",

                borderUpColor: "#22c55e",
                borderDownColor: "#ef4444",

                wickUpColor: "#22c55e",
                wickDownColor: "#ef4444",

                priceFormat: {
                    type: "price",
                    precision: 2,
                    minMove: 0.01
                },

                lastValueVisible: true,
                priceLineVisible: true
            }
        );

    await loadChartData();

    if (typeof ResizeObserver !== "undefined") {

        chartResizeObserver =
            new ResizeObserver(
                entries => {

                    for (
                        const entry of entries
                    ) {

                        if (!chart) {
                            return;
                        }

                        chart.resize(
                            entry.contentRect.width,
                            entry.contentRect.height
                        );
                    }
                }
            );

        chartResizeObserver.observe(container);
    }

    /* Real-time price subscription */
    subscribeToAssetPrice();
}

/* ------------------------------------------------------------
   REAL-TIME PRICE SUBSCRIPTION
   ------------------------------------------------------------ */

function subscribeToAssetPrice() {

    if (priceSubscription) {

        try {
            supabaseClient.removeChannel(priceSubscription);
        } catch (e) {
            console.warn(e);
        }

        priceSubscription = null;
    }

    if (!currentAsset) {
        return;
    }

    priceSubscription = supabaseClient
        .channel("asset-price-" + currentAsset.id)
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "Assets",
                filter: "id=eq." + currentAsset.id
            },
            async (payload) => {

                if (!payload.new) {
                    return;
                }

                currentAsset = payload.new;

                setText(
                    "asset-price",
                    formatMoney(currentAsset.price)
                );

                setText(
                    "trade-price",
                    formatMoney(currentAsset.price)
                );

                updateAssetChange(currentAsset);
                updateTradePreview();

                /*
                 * Smoothly update the last candle instead of
                 * rebuilding the entire chart.
                 */
                if (chart && candleSeries) {

                    const price = Number(currentAsset.price);

                    if (chartCandles.length > 0) {

                        const last =
                            chartCandles[chartCandles.length - 1];

                        last.close = price;
                        last.high = Math.max(last.high, price);
                        last.low = Math.min(last.low, price);

                        candleSeries.update(last);

                    } else if (price > 0) {

                        /*
                         * No historical candles yet — create the
                         * first one from the live price update.
                         */
                        const time =
                            Math.floor(Date.now() / 1000);

                        const first = {
                            time,
                            open: price,
                            high: price,
                            low: price,
                            close: price
                        };

                        chartCandles = [first];
                        candleSeries.setData(chartCandles);

                        hideChartMessage();
                    }
                }
            }
        )
        .subscribe();
}


// ------------------------------------------------------------
// CHART DATA
// ------------------------------------------------------------

async function loadChartData() {

    if (!currentAsset || !candleSeries) {
        return;
    }

    const periodStart =
        getChartStartDate(
            currentChartPeriod
        );

    let query =
        supabaseClient
            .from("PriceHistory")
            .select("*")
            .eq(
                "asset_id",
                currentAsset.id
            )
            .order(
                "recorded_at",
                {
                    ascending: true
                }
            );

    if (currentChartPeriod !== "ALL") {

        query =
            query.gte(
                "recorded_at",
                periodStart.toISOString()
            );
    }

    const {
        data: history,
        error
    } = await query;

    if (error) {

        console.error(
            "Chart history error:",
            error
        );

        showChartMessage(
            "Could not load price history."
        );

        return;
    }

    const candles =
        buildCandles(
            history || []
        );

    const livePrice =
        Number(currentAsset.price || 0);

    if (candles.length > 0 && livePrice > 0) {

        /*
         * The last history row may be stale — trades and
         * real-time updates change the price without writing
         * a new history row. Update the last candle so the
         * chart always ends at the live price.
         */
        const last = candles[candles.length - 1];

        last.close = livePrice;
        last.high = Math.max(last.high, livePrice);
        last.low = Math.min(last.low, livePrice);

    } else if (candles.length === 0 && livePrice > 0) {

        /*
         * Brand new asset with zero history rows.
         * Seed a single candle so the chart isn't empty.
         */
        const time =
            Math.floor(Date.now() / 1000);

        candles.push({
            time,
            open: livePrice,
            high: livePrice,
            low: livePrice,
            close: livePrice
        });
    }

    if (!candles.length) {

        candleSeries.setData([]);

        showChartMessage(
            "Not enough real market history yet."
        );

        return;
    }

    hideChartMessage();

    chartCandles = candles;
    candleSeries.setData(candles);

    if (chart) {

        /*
         * With very few candles fitContent() squeezes them
         * into hairlines that look like a green "+".
         * Keep a minimum logical range so candles stay
         * readable.
         */
        if (candles.length < 6) {

            const lastTime =
                candles[candles.length - 1].time;

            const firstTime =
                candles[0].time;

            const span =
                lastTime - firstTime;

            const minSpan =
                span < 3600
                    ? 3600
                    : span * 1.5;

            chart.timeScale().setVisibleRange({
                from: lastTime - minSpan,
                to: lastTime + minSpan * 0.15
            });

        } else {

            chart.timeScale().fitContent();
        }
    }
}


// ------------------------------------------------------------
// REAL CANDLES
// ------------------------------------------------------------

function buildCandles(history) {

    const rows =
        [...history]
            .sort(
                (a, b) =>
                    new Date(a.recorded_at).getTime() -
                    new Date(b.recorded_at).getTime()
            );

    const candles = [];

    let previousTime = 0;
    let previousClose = null;

    rows.forEach(row => {

        const timestamp =
            new Date(
                row.recorded_at
            ).getTime();

        if (!Number.isFinite(timestamp)) {
            return;
        }

        let time =
            Math.floor(
                timestamp / 1000
            );

        /*
         * Lightweight Charts requires strictly increasing
         * timestamps.
         */
        if (time <= previousTime) {
            time = previousTime + 1;
        }

        const close =
            Number(
                row.close_price ??
                row.price
            );

        if (
            !Number.isFinite(close) ||
            close <= 0
        ) {
            return;
        }

        let open =
            Number(row.open_price);

        let high =
            Number(row.high_price);

        let low =
            Number(row.low_price);

        const hasValidOHLC =
            Number.isFinite(open) &&
            Number.isFinite(high) &&
            Number.isFinite(low) &&
            open > 0 &&
            high >= Math.max(open, close) &&
            low <= Math.min(open, close) &&
            high >= low;

        /*
         * If OHLC exists, use the actual stored values.
         */
        if (!hasValidOHLC) {

            /*
             * Infer OHLC from sequential prices.
             * Add a small realistic wick so candles
             * don't look like flat bars.
             */
            open =
                previousClose !== null
                    ? previousClose
                    : close;

            const move = Math.abs(close - open);
            const wick = move * (0.08 + Math.random() * 0.22) || close * 0.0015;

            high =
                Math.max(open, close) + wick;

            low =
                Math.min(open, close) - wick;
        }

        candles.push({
            time,
            open,
            high,
            low,
            close
        });

        previousTime = time;
        previousClose = close;
    });

    return candles;
}


// ------------------------------------------------------------
// CHART PERIOD CONTROLS
// ------------------------------------------------------------

/*
 * Period controls live in the HTML markup.
 * setChartPeriod() toggles their active state.
 */


function setChartPeriod(period) {

    currentChartPeriod =
        period;

    document
        .querySelectorAll(".chart-periods button")
        .forEach(button => {

            const active =
                button.dataset.period ===
                period;

            button.classList.toggle(
                "active",
                active
            );
        });

    loadChartData();
}


function getChartStartDate(period) {

    const now =
        new Date();

    const start =
        new Date(now);

    const map = {
        "1W": "7D",
        "1M": "30D",
        "3M": "90D"
    };

    const p = map[period] || period;

    switch (p) {

        case "1D":

            start.setDate(
                now.getDate() - 1
            );

            break;

        case "7D":

            start.setDate(
                now.getDate() - 7
            );

            break;

        case "30D":

            start.setDate(
                now.getDate() - 30
            );

            break;

        case "90D":

            start.setDate(
                now.getDate() - 90
            );

            break;

        case "1Y":

            start.setFullYear(
                now.getFullYear() - 1
            );

            break;

        case "ALL":

        default:

            start.setFullYear(
                now.getFullYear() - 10
            );

            break;
    }

    return start;
}


function showChartMessage(message) {

    const chartContainer =
        document.getElementById("price-chart");

    if (!chartContainer) {
        return;
    }

    let messageElement =
        document.getElementById(
            "mkm-chart-message"
        );

    if (!messageElement) {

        messageElement =
            document.createElement("div");

        messageElement.id =
            "mkm-chart-message";

        messageElement.className =
            "chart-message-overlay";

        chartContainer.appendChild(
            messageElement
        );
    }

    messageElement.textContent =
        message;
}


function hideChartMessage() {

    const messageElement =
        document.getElementById(
            "mkm-chart-message"
        );

    if (messageElement) {
        messageElement.remove();
    }
}


// ============================================================
// ADMIN
// ============================================================

async function loadAdminPanel() {

    if (
        !currentUser ||
        currentUser.id !== MKM_OWNER_ID
    ) {

        alert(
            "Admin access denied."
        );

        return;
    }

    await loadAdminAssets();
    await loadMarketSettings();
    await loadAdminCodes();
    await loadAdminRequests();

    showPage("admin");
}


/* ------------------------------------------------------------
   ADMIN FORM — CATEGORY-AWARE FIELDS
   ------------------------------------------------------------ */

function updateCompanyFormForCategory() {

    const select =
        document.getElementById("company-category");

    const group =
        document.getElementById("company-shares-group");

    const input =
        document.getElementById("company-shares");

    if (!select || !group || !input) {
        return;
    }

    const category = select.value;

    if (category === "stock") {

        group.style.display = "";
        input.required = true;
        group.querySelector("label").textContent =
            "Shares Outstanding";

    } else if (category === "crypto") {

        group.style.display = "";
        input.required = true;
        group.querySelector("label").textContent =
            "Circulating Supply";

    } else {

        /*
         * Commodities, forex, bonds, indices
         * don't have shares/supply concepts.
         */
        group.style.display = "none";
        input.required = false;
        input.value = "1";
    }
}


async function loadAdminAssets() {

    const {
        data: assets,
        error
    } = await supabaseClient
        .from("Assets")
        .select("*")
        .order("name");

    if (error) {

        console.error(error);
        return;
    }

    const list =
        document.getElementById(
            "admin-company-list"
        );

    const eventAsset =
        document.getElementById(
            "event-asset"
        );

    if (list) {
        list.innerHTML = "";
    }

    if (eventAsset) {
        eventAsset.innerHTML = "";
    }

    let totalMarketCap = 0;

    (assets || []).forEach(asset => {

        totalMarketCap +=
            Number(asset.market_cap || 0);

        if (list) {

            const row =
                document.createElement("div");

            row.className =
                "admin-company-row";

            row.innerHTML = `
                <div>
                    <strong>
                        ${escapeHTML(asset.name)}
                    </strong>

                    <span>
                        ${escapeHTML(asset.symbol)}
                    </span>
                </div>

                <div>
                    ${formatMoney(asset.price)}
                </div>

                <div>
                    ${formatMoney(asset.market_cap || 0)}
                </div>
            `;

            list.appendChild(row);
        }

        if (eventAsset) {

            const option =
                document.createElement("option");

            option.value =
                asset.id;

            option.textContent =
                `${asset.symbol} — ${asset.name}`;

            eventAsset.appendChild(option);
        }
    });

    setText(
        "admin-asset-count",
        assets?.length || 0
    );

    setText(
        "admin-market-cap",
        formatMoney(totalMarketCap)
    );
}


// ------------------------------------------------------------
// ADD COMPANY
// ------------------------------------------------------------

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const companyForm =
            document.getElementById(
                "company-form"
            );

        if (!companyForm) {
            return;
        }

        companyForm.addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                if (
                    !currentUser ||
                    currentUser.id !==
                    MKM_OWNER_ID
                ) {
                    return;
                }

                const name =
                    document.getElementById(
                        "company-name"
                    ).value.trim();

                const symbol =
                    document.getElementById(
                        "company-symbol"
                    ).value.trim()
                    .toUpperCase();

                const category =
                    document.getElementById(
                        "company-category"
                    ).value;

                const price =
                    Number(
                        document.getElementById(
                            "company-price"
                        ).value
                    );

                const sharesGroup =
                    document.getElementById(
                        "company-shares-group"
                    );

                const shares =
                    sharesGroup &&
                    sharesGroup.style.display === "none"
                        ? 1
                        : Number(
                            document.getElementById(
                                "company-shares"
                            ).value
                        );

                const message =
                    document.getElementById(
                        "company-message"
                    );

                if (
                    !name ||
                    !symbol ||
                    !Number.isFinite(price) ||
                    price <= 0 ||
                    !Number.isInteger(shares) ||
                    shares <= 0
                ) {

                    if (message) {
                        message.textContent =
                            "Please enter valid company information.";
                    }

                    return;
                }

                if (message) {
                    message.textContent =
                        "Adding company...";
                }

                try {

                    const now =
                        new Date().toISOString();

                    const {
                        data,
                        error
                    } = await supabaseClient
                        .from("Assets")
                        .insert({
                            name,
                            symbol,
                            category,
                            price,
                            previous_price: price,
                            day_open_price: price,
                            last_day_reset: now,
                            market_cap:
                                price * shares,
                            volume: 0,
                            description: ""
                        })
                        .select()
                        .single();

                    if (error) {
                        throw error;
                    }

                    await recordPriceHistory(
                        data.id,
                        price,
                        price
                    );

                    if (message) {
                        message.textContent =
                            "Company added successfully.";
                    }

                    companyForm.reset();
                    updateCompanyFormForCategory();

                    await loadAdminAssets();

                } catch (error) {

                    console.error(error);

                    if (message) {
                        message.textContent =
                            error.message ||
                            "Could not add company.";
                    }
                }
            }
        );
    }
);


// ============================================================
// MARKET SETTINGS
// ============================================================

async function loadMarketSettings() {

    const {
        data: settings,
        error
    } = await supabaseClient
        .from("MarketSettings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

    if (error) {

        console.error(error);
        return;
    }

    if (!settings) {
        return;
    }

    const enabled =
        document.getElementById(
            "automatic-market-enabled"
        );

    const interval =
        document.getElementById(
            "market-interval"
        );

    const movement =
        document.getElementById(
            "market-max-movement"
        );

    if (enabled) {
        enabled.checked =
            settings.automatic_enabled;
    }

    if (interval) {
        interval.value =
            settings.movement_interval_minutes;
    }

    if (movement) {
        movement.value =
            settings.max_normal_movement_percent;
    }
}


async function saveMarketSettings() {

    if (
        !currentUser ||
        currentUser.id !== MKM_OWNER_ID
    ) {
        return;
    }

    const enabled =
        document.getElementById(
            "automatic-market-enabled"
        )?.checked;

    const interval =
        Number(
            document.getElementById(
                "market-interval"
            )?.value
        );

    const movement =
        Number(
            document.getElementById(
                "market-max-movement"
            )?.value
        );

    const message =
        document.getElementById(
            "market-settings-message"
        );

    if (
        !Number.isInteger(interval) ||
        interval <= 0 ||
        !Number.isFinite(movement) ||
        movement <= 0
    ) {

        if (message) {
            message.textContent =
                "Enter valid market settings.";
        }

        return;
    }

    const {
        error
    } = await supabaseClient
        .from("MarketSettings")
        .upsert({
            id: 1,
            automatic_enabled:
                Boolean(enabled),
            movement_interval_minutes:
                interval,
            max_normal_movement_percent:
                movement,
            updated_at:
                new Date().toISOString()
        });

    if (error) {

        console.error(error);

        if (message) {
            message.textContent =
                error.message;
        }

        return;
    }

    if (message) {
        message.textContent =
            "Market settings saved.";
    }

    await startMarketTimer();
}


// ============================================================
// MARKET EVENTS
// ============================================================

async function createMarketEvent() {

    if (
        !currentUser ||
        currentUser.id !== MKM_OWNER_ID
    ) {
        return;
    }

    const assetId =
        document.getElementById(
            "event-asset"
        )?.value;

    const direction =
        document.getElementById(
            "event-direction"
        )?.value;

    const strength =
        document.getElementById(
            "event-strength"
        )?.value;

    const duration =
        Number(
            document.getElementById(
                "event-duration"
            )?.value
        );

    const message =
        document.getElementById(
            "market-event-message"
        );

    if (
        !assetId ||
        !direction ||
        !strength ||
        !Number.isInteger(duration) ||
        duration <= 0
    ) {

        if (message) {
            message.textContent =
                "Enter valid event information.";
        }

        return;
    }

    const expiresAt =
        new Date(
            Date.now() +
            duration * 60 * 1000
        ).toISOString();

    const {
        error
    } = await supabaseClient
        .from("MarketEvents")
        .insert({
            asset_id: assetId,
            direction,
            strength,
            duration_minutes:
                duration,
            expires_at:
                expiresAt
        });

    if (error) {

        console.error(error);

        if (message) {
            message.textContent =
                error.message;
        }

        return;
    }

    if (message) {
        message.textContent =
            "Market event created.";
    }
}


// ============================================================
// PRICE HISTORY
// ============================================================

async function recordPriceHistory(
    assetId,
    price,
    previousPrice = null
) {

    const close =
        Number(price);

    if (
        !Number.isFinite(close) ||
        close <= 0
    ) {
        return;
    }

    const previous =
        previousPrice === null
            ? close
            : Number(previousPrice);

    const open =
        Number.isFinite(previous) &&
        previous > 0
            ? previous
            : close;

    /*
     * Realistic wicks: the price wiggled between
     * open and close, so high/low extend slightly
     * beyond the exact open/close range.
     */
    const move = Math.abs(close - open);
    const wick = move * (0.06 + Math.random() * 0.18) || close * 0.001;

    const high =
        Math.max(open, close) + wick;

    const low =
        Math.min(open, close) - wick;

    const {
        error
    } = await supabaseClient
        .from("PriceHistory")
        .insert({
            asset_id: assetId,
            price: close,
            open_price: open,
            high_price: high,
            low_price: low,
            close_price: close,
            recorded_at:
                new Date().toISOString()
        });

    if (error) {

        console.error(
            "Price history error:",
            error
        );
    }
}


// ============================================================
// BROWSER MARKET SIMULATION
// ============================================================

async function runMarketSimulation() {

    try {

        const {
            data: settings
        } = await supabaseClient
            .from("MarketSettings")
            .select("*")
            .eq("id", 1)
            .maybeSingle();

        if (
            !settings ||
            !settings.automatic_enabled
        ) {
            return;
        }

        const {
            data: assets,
            error
        } = await supabaseClient
            .from("Assets")
            .select("*");

        if (error) {
            throw error;
        }

        for (const asset of assets || []) {

            await simulateAssetMovement(
                asset,
                settings
            );
        }

        if (
            document
                .getElementById("market")
                ?.classList.contains("hidden") === false
        ) {

            await loadMarket();
        }

        if (currentAsset) {

            await refreshCurrentAsset();
        }

    } catch (error) {

        console.error(
            "Market simulation error:",
            error
        );
    }
}


async function simulateAssetMovement(
    asset,
    settings
) {

    const current =
        Number(asset.price || 0);

    if (current <= 0) {
        return;
    }

    /*
     * Reset day_open_price if it's a new day
     */
    const lastReset = asset.last_day_reset ? new Date(asset.last_day_reset) : null;
    const now = new Date();
    const isNewDay = !lastReset || 
        lastReset.getFullYear() !== now.getFullYear() ||
        lastReset.getMonth() !== now.getMonth() ||
        lastReset.getDate() !== now.getDate();

    if (isNewDay) {
        await supabaseClient
            .from("Assets")
            .update({ day_open_price: current, last_day_reset: now.toISOString() })
            .eq("id", asset.id);
    }

    const behaviour =
        getCategoryBehaviour(asset.category);

    const maxMovement =
        Number(
            settings.max_normal_movement_percent ||
            1
        ) *
        behaviour.volatility;

    /*
     * Volume affects volatility.
     * High volume = liquid = more stable (smaller moves).
     * Low volume = illiquid = wilder swings.
     */
    const volume =
        Number(asset.volume || 0);

    const liquidityFactor =
        Math.max(
            0.15,
            1 /
            (
                1 +
                Math.log10(volume + behaviour.liquidityBase) *
                0.12
            )
        );

    /*
     * Slight directional drift so assets don't just
     * oscillate around the same price forever.
     */
    const drift =
        (Math.random() - 0.48) *
        behaviour.drift;

    let movement =
        (
            Math.random() * 2 - 1
        ) *
        maxMovement *
        liquidityFactor +
        drift;

    /*
     * Gap behaviour — some markets (crypto) gap
     * more often than others (forex).
     */
    if (Math.random() < behaviour.gapChance) {
        movement *= (1.2 + Math.random() * 1.5);
    }

    const {
        data: events
    } = await supabaseClient
        .from("MarketEvents")
        .select("*")
        .eq(
            "asset_id",
            asset.id
        )
        .gt(
            "expires_at",
            new Date().toISOString()
        )
        .order(
            "created_at",
            {
                ascending: false
            }
        )
        .limit(1);

    const event =
        events?.[0];

    if (event) {

        let multiplier = 1;

        if (event.strength === "low") {

            multiplier = 1.5;

        } else if (event.strength === "medium") {

            multiplier = 2.5;

        } else if (event.strength === "high") {

            multiplier = 4;
        }

        movement =
            Math.abs(movement) *
            multiplier *
            (
                event.direction === "up"
                    ? 1
                    : -1
            );
    }

    const newPrice =
        Math.max(
            0.01,
            current *
            (
                1 +
                movement / 100
            )
        );

    const {
        error
    } = await supabaseClient
        .from("Assets")
        .update({
            previous_price:
                current,

            price:
                newPrice
        })
        .eq(
            "id",
            asset.id
        );

    if (error) {

        console.error(
            "Asset update failed:",
            error
        );

        return;
    }

    await recordPriceHistory(
        asset.id,
        newPrice,
        current
    );
}


// ------------------------------------------------------------
// START MARKET TIMER
// ------------------------------------------------------------

async function startMarketTimer() {

    if (marketTimer) {

        clearInterval(
            marketTimer
        );

        marketTimer = null;
    }

    const {
        data: settings
    } = await supabaseClient
        .from("MarketSettings")
        .select(
            "movement_interval_minutes"
        )
        .eq("id", 1)
        .maybeSingle();

    const minutes =
        Number(
            settings?.movement_interval_minutes ||
            5
        );

    marketTimer =
        setInterval(
            runMarketSimulation,
            minutes * 60 * 1000
        );
}


// ============================================================
// NEWS
// ============================================================

async function loadNews() {

    const {
        data: news,
        error
    } = await supabaseClient
        .from("News")
        .select(`
            *,
            Assets (
                name,
                symbol
            )
        `)
        .eq(
            "published",
            true
        )
        .order(
            "created_at",
            {
                ascending: false
            }
        );

    if (error) {

        console.error(error);
        return;
    }

    const container =
        document.getElementById("news-list");

    if (!container) {
        return;
    }

    if (!news || news.length === 0) {

        container.innerHTML =
            "<p>No news available.</p>";

        showPage("news");

        return;
    }

    container.innerHTML = "";

    news.forEach(article => {

        const card =
            document.createElement("div");

        card.className = "card";

        card.innerHTML = `
            <h2>
                ${escapeHTML(article.headline)}
            </h2>

            <p>
                ${escapeHTML(article.content)}
            </p>

            <small>
                ${
                    article.Assets
                        ? escapeHTML(
                            article.Assets.symbol
                        )
                        : "MKM Exchange"
                }
                ·
                ${formatDateTime(article.created_at)}
            </small>
        `;

        container.appendChild(card);
    });

    showPage("news");
}


// ============================================================
// CODE REDEMPTION
// ============================================================

async function redeemCode() {
    const input = document.getElementById("redeem-code-input");
    const message = document.getElementById("redeem-message");
    const code = input?.value.trim();

    if (!code) {
        if (message) { message.textContent = "Enter a code."; message.style.color = "#ef4444"; }
        return;
    }
    if (!currentUser) {
        if (message) { message.textContent = "Please log in."; message.style.color = "#ef4444"; }
        return;
    }

    if (message) { message.textContent = "Redeeming..."; message.style.color = ""; }

    try {
        const { data, error } = await supabaseClient.rpc("redeem_code", {
            p_code: code,
            p_user_id: currentUser.id
        });
        if (error) throw error;

        if (data.success) {
            if (message) {
                message.textContent = `${data.message} +${formatMoney(data.reward)}`;
                message.style.color = "#22c55e";
            }
            if (input) input.value = "";
            await loadDashboardDataOnly();
        } else {
            if (message) { message.textContent = data.message; message.style.color = "#ef4444"; }
        }
    } catch (err) {
        console.error("Redeem error:", err);
        if (message) { message.textContent = err.message || "Redemption failed."; message.style.color = "#ef4444"; }
    }
}


// ============================================================
// COMPANY LICENSE
// ============================================================

async function buyLicenseTier(tier) {
    if (!currentUser) { alert("Please log in."); return; }

    const config = LICENSE_TIERS[tier];
    if (!config) return;

    const confirmation = confirm(
        `Buy ${config.name} License for ${formatMoney(config.price)}?\n\n` +
        `• Adds ${config.slots} company slot(s)\n` +
        `• Max shares per company: ${formatNumber(config.maxShares)}\n` +
        `• Commission rate: ${config.commissionRate}% per trade\n` +
        `• Establishment fee: ${formatMoney(config.establishmentFee)} per company\n` +
        `• Weekly listing fee: ${formatMoney(config.weeklyFee)} per company`
    );
    if (!confirmation) return;

    try {
        const { data, error } = await supabaseClient.rpc("buy_company_license_tier", {
            p_tier: tier
        });
        if (error) throw error;

        if (data.success) {
            alert(data.message);
            await loadDashboardDataOnly();
            const myCompaniesPage = document.getElementById("my-companies");
            if (myCompaniesPage && !myCompaniesPage.classList.contains("hidden")) {
                await loadMyCompanies();
            } else {
                await loadDashboard();
            }
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error("License purchase error:", err);
        alert(err.message || "Could not purchase license.");
    }
}

// Legacy wrapper for old calls
async function buyCompanyLicense() {
    await buyLicenseTier("basic");
}


// ============================================================
// MY COMPANIES
// ============================================================

async function loadMyCompanies() {
    if (!currentUser) { await checkSession(); return; }

    const { data: profile } = await supabaseClient
        .from("Profiles")
        .select("company_license, license_tier, license_slots, license_purchased_at, balance")
        .eq("id", currentUser.id)
        .maybeSingle();

    renderLicenseStatus(profile);

    // Load my requests
    await loadMyRequests();

    // Load my companies with fee status
    const { data: companies, error } = await supabaseClient
        .from("Assets")
        .select("*")
        .eq("created_by_user_id", currentUser.id)
        .order("created_at", { ascending: false });

    if (error) console.error(error);
    renderMyCompaniesList(companies || [], profile);

    // Show slots info
    const slotsInfo = document.getElementById("slots-info");
    if (slotsInfo) {
        const totalSlots = profile?.license_slots || 0;
        const used = (companies || []).filter(c => !c.is_delisted).length;
        const pending = document.querySelectorAll("#my-requests-list .request-row").length;
        const remaining = Math.max(0, totalSlots - used - pending);
        slotsInfo.innerHTML = `Slots: <strong>${used + pending}/${totalSlots}</strong> used · <strong>${remaining}</strong> remaining`;
        slotsInfo.style.color = remaining > 0 ? "#22c55e" : "#ef4444";
    }

    showPage("my-companies");
}


function renderLicenseStatus(profile) {
    const text = document.getElementById("license-status-text");
    const btn = document.getElementById("buy-license-btn");
    const formCard = document.getElementById("establish-form-card");
    const tierInfo = document.getElementById("license-tier-info");

    if (!text) return;

    const tier = profile?.license_tier;
    const config = tier ? LICENSE_TIERS[tier] : null;
    const slots = profile?.license_slots || 0;

    if (config && slots > 0) {
        text.innerHTML = `<span style="color:#22c55e;font-weight:700;">${config.name} License</span> · ${slots} slot(s)`;
        if (tierInfo) {
            tierInfo.innerHTML = `
                <div class="tier-details">
                    <p>Slots: ${slots} total</p>
                    <p>Max shares per company: ${formatNumber(config.maxShares)}</p>
                    <p>Commission: ${config.commissionRate}% per trade</p>
                    <p>Establishment fee: ${formatMoney(config.establishmentFee)} per company</p>
                    <p>Weekly listing fee: ${formatMoney(config.weeklyFee)} per company</p>
                </div>
            `;
            tierInfo.classList.remove("hidden");
        }
        if (btn) {
            btn.classList.remove("hidden");
            btn.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:6px;margin-top:12px;">
                    <button onclick="buyLicenseTier('basic')">+ Basic Slot — ${formatMoney(2500)}</button>
                    <button onclick="buyLicenseTier('standard')">+ Standard Slot — ${formatMoney(10000)}</button>
                    <button onclick="buyLicenseTier('enterprise')">+ Enterprise Slot — ${formatMoney(50000)}</button>
                </div>
            `;
        }
        if (formCard) formCard.classList.remove("hidden");
    } else {
        text.innerHTML = `Status: <span style="color:#94a3b8;">No license</span>`;
        if (tierInfo) tierInfo.classList.add("hidden");
        if (btn) {
            btn.classList.remove("hidden");
            btn.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:6px;">
                    <button onclick="buyLicenseTier('basic')">Basic — ${formatMoney(2500)}</button>
                    <button onclick="buyLicenseTier('standard')">Standard — ${formatMoney(10000)}</button>
                    <button onclick="buyLicenseTier('enterprise')">Enterprise — ${formatMoney(50000)}</button>
                </div>
            `;
        }
        if (formCard) formCard.classList.add("hidden");
    }
}


async function loadMyRequests() {
    const container = document.getElementById("my-requests-list");
    if (!container) return;

    const { data: requests, error } = await supabaseClient
        .from("CompanyRequests")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false });

    if (error || !requests || !requests.length) {
        container.innerHTML = "<p style=\"color:#94a3b8;\">No pending requests.</p>";
        return;
    }

    container.innerHTML = "";
    requests.forEach(req => {
        const row = document.createElement("div");
        row.className = "request-row";
        const statusColor = req.status === 'pending' ? '#eab308' : req.status === 'approved' ? '#22c55e' : '#ef4444';
        row.innerHTML = `
            <div>
                <strong>${escapeHTML(req.name)} (${escapeHTML(req.symbol)})</strong>
                <span>${formatCategory(req.category)} · ${formatNumber(req.requested_shares)} shares requested</span>
            </div>
            <div style="color:${statusColor};font-weight:700;text-transform:uppercase;font-size:11px;">${req.status}</div>
            <div>${formatDate(req.created_at)}</div>
            ${req.admin_notes ? `<div style="color:#94a3b8;font-size:12px;margin-top:4px;">Note: ${escapeHTML(req.admin_notes)}</div>` : ''}
        `;
        container.appendChild(row);
    });
}


function renderMyCompaniesList(companies, profile) {
    const container = document.getElementById("my-companies-list");
    if (!container) return;

    const config = profile?.license_tier ? LICENSE_TIERS[profile.license_tier] : null;

    if (!companies.length) {
        container.innerHTML = `
            <p style="color:#94a3b8;">No companies yet.</p>
            <p style="color:var(--muted);font-size:12px;margin-top:8px;">
                Each company costs ${config ? formatMoney(config.establishmentFee) : formatMoney(5000)} to establish (paid on approval).
            </p>
        `;
        return;
    }

    container.innerHTML = "";
    companies.forEach(asset => {
        const now = new Date();
        const paidUntil = asset.listing_fee_paid_until ? new Date(asset.listing_fee_paid_until) : null;
        const isDelisted = asset.is_delisted === true || (paidUntil && paidUntil < now);
        const daysLeft = paidUntil ? Math.ceil((paidUntil - now) / (1000 * 60 * 60 * 24)) : 0;

        const row = document.createElement("div");
        row.className = "company-row" + (isDelisted ? " delisted" : "");

        let feeStatus = '';
        if (isDelisted) {
            feeStatus = `<span style="color:#ef4444;font-weight:700;">DELISTED</span>`;
        } else if (daysLeft <= 3) {
            feeStatus = `<span style="color:#eab308;font-weight:700;">${daysLeft}d left</span>`;
        } else {
            feeStatus = `<span style="color:#22c55e;">${daysLeft}d left</span>`;
        }

        row.innerHTML = `
            <div class="company-info" onclick="${isDelisted ? '' : `loadAssetDetail('${asset.id}')`}">
                <strong>${escapeHTML(asset.name)} ${isDelisted ? '⚠️' : ''}</strong>
                <span>${escapeHTML(asset.symbol)} · ${formatCategory(asset.category)}</span>
                <span style="color:var(--muted);font-size:12px;">Founder shares: ${formatNumber(asset.founder_shares || 0)} · Commission: ${asset.commission_rate || 0}%</span>
            </div>
            <div class="company-stats">
                <div>${formatMoney(asset.price)}</div>
                <div>${formatMoney(asset.market_cap || 0)}</div>
                <div>${feeStatus}</div>
            </div>
            <div class="company-actions">
                ${!isDelisted ? `<button class="secondary" onclick="event.stopPropagation();loadChat('${asset.id}');">Message</button>` : ''}
                <button onclick="event.stopPropagation();payListingFee('${asset.id}')">Pay Fee</button>
            </div>
        `;
        container.appendChild(row);
    });
}


async function submitCompanyRequest(event) {
    event.preventDefault();
    if (!currentUser) return;

    const message = document.getElementById("establish-message");
    const name = document.getElementById("establish-name")?.value.trim();
    const symbol = document.getElementById("establish-symbol")?.value.trim().toUpperCase();
    const shares = Number(document.getElementById("establish-shares")?.value);

    if (!name || !symbol || !Number.isInteger(shares) || shares <= 0) {
        if (message) { message.textContent = "Please fill in all fields correctly."; message.style.color = "#ef4444"; }
        return;
    }

    if (message) { message.textContent = "Submitting request..."; message.style.color = ""; }

    try {
        const { data, error } = await supabaseClient.rpc("submit_company_request", {
            p_name: name,
            p_symbol: symbol,
            p_requested_shares: shares
        });
        if (error) throw error;

        if (data.success) {
            if (message) { message.textContent = data.message; message.style.color = "#22c55e"; }
            document.getElementById("establish-form")?.reset();
            await loadMyCompanies();
        } else {
            if (message) { message.textContent = data.message; message.style.color = "#ef4444"; }
        }
    } catch (err) {
        console.error("Request error:", err);
        if (message) { message.textContent = err.message || "Could not submit request."; message.style.color = "#ef4444"; }
    }
}


async function payListingFee(assetId) {
    if (!currentUser) return;

    try {
        const { data, error } = await supabaseClient.rpc("pay_listing_fee", {
            p_asset_id: assetId
        });
        if (error) throw error;

        if (data.success) {
            alert(data.message);
            await loadMyCompanies();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error("Fee payment error:", err);
        alert(err.message || "Could not pay fee.");
    }
}


// ============================================================
// ADMIN: REDEMPTION CODES
// ============================================================

async function loadAdminCodes() {
    if (!currentUser || currentUser.id !== MKM_OWNER_ID) return;

    const { data: codes, error } = await supabaseClient
        .from("RedemptionCodes")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) { console.error(error); return; }

    const container = document.getElementById("admin-codes-list");
    if (!container) return;

    if (!codes || !codes.length) {
        container.innerHTML = "<p style=\"color:#94a3b8;\">No codes created yet.</p>";
        return;
    }

    container.innerHTML = "";
    codes.forEach(code => {
        const row = document.createElement("div");
        row.className = "code-row";
        const expired = code.expires_at && new Date(code.expires_at) < new Date();
        const status = !code.active ? "Inactive" : expired ? "Expired" : code.uses_count >= code.max_uses ? "Used Up" : "Active";
        const statusColor = status === "Active" ? "#22c55e" : "#ef4444";

        row.innerHTML = `
            <div>
                <strong>${escapeHTML(code.code)}</strong>
                <span>${formatMoney(code.reward_amount)} · ${code.uses_count}/${code.max_uses} uses</span>
            </div>
            <div style="color:${statusColor};font-weight:700;">${status}</div>
            <div>${code.expires_at ? formatDateTime(code.expires_at) : "No expiry"}</div>
        `;
        container.appendChild(row);
    });
}


async function createRedemptionCode(event) {
    event.preventDefault();
    if (!currentUser || currentUser.id !== MKM_OWNER_ID) return;

    const message = document.getElementById("code-message");
    const codeVal = document.getElementById("code-value")?.value.trim().toUpperCase();
    const reward = Number(document.getElementById("code-reward")?.value);
    const maxUses = Number(document.getElementById("code-uses")?.value);
    const expiryVal = document.getElementById("code-expiry")?.value;

    if (!codeVal || !Number.isFinite(reward) || reward <= 0 || !Number.isInteger(maxUses) || maxUses <= 0) {
        if (message) { message.textContent = "Enter valid code details."; message.style.color = "#ef4444"; }
        return;
    }

    let expiresAt = null;
    if (expiryVal) expiresAt = new Date(expiryVal).toISOString();

    try {
        const { data, error } = await supabaseClient.rpc("create_redemption_code", {
            p_code: codeVal,
            p_reward: reward,
            p_max_uses: maxUses,
            p_expires_at: expiresAt
        });
        if (error) throw error;

        if (data.success) {
            if (message) { message.textContent = data.message; message.style.color = "#22c55e"; }
            document.getElementById("redeem-code-form")?.reset();
            await loadAdminCodes();
        } else {
            if (message) { message.textContent = data.message; message.style.color = "#ef4444"; }
        }
    } catch (err) {
        console.error("Code creation error:", err);
        if (message) { message.textContent = err.message || "Could not create code."; message.style.color = "#ef4444"; }
    }
}


// ============================================================
// SOCIAL / PEOPLE
// ============================================================

let currentChatPartner = null;
let messageSubscription = null;

async function loadSocial() {
    if (!currentUser) { await checkSession(); return; }
    await loadFollowing();
    await loadFriendRequests();
    showPage("social");
}

async function searchPeople() {
    const input = document.getElementById("people-search");
    const message = document.getElementById("people-search-message");
    const container = document.getElementById("people-search-results");
    const query = input?.value.trim();

    if (!query) {
        if (container) container.innerHTML = "<p>Search for someone to view their profile.</p>";
        return;
    }

    if (message) message.textContent = "Searching...";

    const { data: profiles, error } = await supabaseClient
        .from("Profiles")
        .select("id, username, display_name, avatar_url, mkm_id, bio, status, created_at")
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .neq("id", currentUser.id)
        .limit(20);

    if (error) {
        console.error(error);
        if (message) message.textContent = "Search failed.";
        return;
    }

    if (message) message.textContent = "";
    renderPeopleSearchResults(profiles || []);
}

async function renderPeopleSearchResults(profiles) {
    const container = document.getElementById("people-search-results");
    if (!container) return;

    if (!profiles.length) {
        container.innerHTML = "<p style=\"color:#94a3b8;\">No users found.</p>";
        return;
    }

    // Get follow status for each
    const { data: myFollows } = await supabaseClient
        .from("Follows")
        .select("following_id")
        .eq("follower_id", currentUser.id);

    const { data: myRequests } = await supabaseClient
        .from("FollowRequests")
        .select("receiver_id, status")
        .eq("sender_id", currentUser.id)
        .eq("status", "pending");

    const followingIds = new Set((myFollows || []).map(f => f.following_id));
    const requestedIds = new Set((myRequests || []).map(r => r.receiver_id));

    container.innerHTML = "";
    profiles.forEach(profile => {
        const isFollowing = followingIds.has(profile.id);
        const isRequested = requestedIds.has(profile.id);

        let buttonText = "Follow";
        let buttonAction = `sendFollowRequest('${profile.id}')`;
        let buttonClass = "";

        if (isFollowing) {
            buttonText = "Following";
            buttonAction = `unfollowUser('${profile.id}')`;
            buttonClass = "secondary";
        } else if (isRequested) {
            buttonText = "Requested";
            buttonAction = `cancelFollowRequest('${profile.id}')`;
            buttonClass = "secondary";
        }

        const card = document.createElement("div");
        card.className = "people-result-row";
        card.innerHTML = `
            <div class="people-info" onclick="loadPublicProfile('${profile.id}')">
                <div class="people-avatar">
                    ${profile.avatar_url
                        ? `<img src="${escapeHTML(profile.avatar_url)}" alt="">`
                        : `<span>${(profile.display_name || profile.username || "?").charAt(0).toUpperCase()}</span>`
                    }
                </div>
                <div class="people-meta">
                    <strong>${escapeHTML(profile.display_name || profile.username)}</strong>
                    <span>@${escapeHTML(profile.username)}</span>
                </div>
            </div>
            <div class="people-actions">
                <button class="${buttonClass}" onclick="${buttonAction}; event.stopPropagation();">${buttonText}</button>
                <button class="secondary" onclick="loadChat('${profile.id}'); event.stopPropagation();">Message</button>
            </div>
        `;
        container.appendChild(card);
    });
}

async function sendFollowRequest(receiverId) {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient.rpc("send_follow_request", {
            p_receiver_id: receiverId
        });
        if (error) throw error;
        if (data.success) {
            await searchPeople();
            await loadFriendRequests();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert(err.message || "Could not send request.");
    }
}

async function cancelFollowRequest(receiverId) {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient.rpc("cancel_follow_request", {
            p_receiver_id: receiverId
        });
        if (error) throw error;
        if (data.success) await searchPeople();
    } catch (err) {
        console.error(err);
    }
}

async function unfollowUser(userId) {
    if (!currentUser) return;
    if (!confirm("Unfollow this user?")) return;
    try {
        const { data, error } = await supabaseClient.rpc("unfollow_user", {
            p_user_id: userId
        });
        if (error) throw error;
        if (data.success) {
            await searchPeople();
            await loadFollowing();
        }
    } catch (err) {
        console.error(err);
    }
}

async function loadFriendRequests() {
    if (!currentUser) return;

    const { data: requests, error } = await supabaseClient
        .from("FollowRequests")
        .select("id, sender_id, created_at")
        .eq("receiver_id", currentUser.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

    const container = document.getElementById("friend-requests-list");
    if (!container) return;

    if (error) {
        container.innerHTML = "<p>Could not load requests.</p>";
        return;
    }

    if (!requests || !requests.length) {
        container.innerHTML = "<p style=\"color:#94a3b8;\">No friend requests yet.</p>";
        return;
    }

    const senderIds = requests.map(r => r.sender_id);
    const { data: profiles } = await supabaseClient
        .from("Profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", senderIds);

    const profileMap = {};
    (profiles || []).forEach(p => profileMap[p.id] = p);

    container.innerHTML = "";
    requests.forEach(req => {
        const profile = profileMap[req.sender_id];
        const row = document.createElement("div");
        row.className = "people-result-row";
        row.innerHTML = `
            <div class="people-info" onclick="loadPublicProfile('${req.sender_id}')">
                <div class="people-avatar">
                    ${profile?.avatar_url
                        ? `<img src="${escapeHTML(profile.avatar_url)}" alt="">`
                        : `<span>${(profile?.display_name || profile?.username || "?").charAt(0).toUpperCase()}</span>`
                    }
                </div>
                <div class="people-meta">
                    <strong>${escapeHTML(profile?.display_name || profile?.username || "User")}</strong>
                    <span>@${escapeHTML(profile?.username || "—")}</span>
                </div>
            </div>
            <div class="people-actions">
                <button onclick="respondFollowRequest('${req.id}', 'accept'); event.stopPropagation();">Accept</button>
                <button class="secondary" onclick="respondFollowRequest('${req.id}', 'reject'); event.stopPropagation();">Reject</button>
            </div>
        `;
        container.appendChild(row);
    });
}

async function respondFollowRequest(requestId, action) {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient.rpc("respond_follow_request", {
            p_request_id: requestId,
            p_action: action
        });
        if (error) throw error;
        if (data.success) {
            await loadFriendRequests();
            await loadFollowing();
        }
    } catch (err) {
        console.error(err);
        alert(err.message || "Action failed.");
    }
}

async function loadFollowing() {
    if (!currentUser) return;

    const { data: follows, error } = await supabaseClient
        .from("Follows")
        .select(`
            following_id,
            Profiles!Follows_following_id_fkey(username, display_name, avatar_url, id)
        `)
        .eq("follower_id", currentUser.id)
        .order("created_at", { ascending: false });

    const container = document.getElementById("friends-list");
    if (!container) return;

    if (error) {
        container.innerHTML = "<p>Could not load.</p>";
        return;
    }

    if (!follows || !follows.length) {
        container.innerHTML = "<p style=\"color:#94a3b8;\">No friends yet. Find people above!</p>";
        return;
    }

    container.innerHTML = "";
    follows.forEach(f => {
        const profile = f.Profiles;
        const row = document.createElement("div");
        row.className = "people-result-row";
        row.innerHTML = `
            <div class="people-info" onclick="loadPublicProfile('${f.following_id}')">
                <div class="people-avatar">
                    ${profile?.avatar_url
                        ? `<img src="${escapeHTML(profile.avatar_url)}" alt="">`
                        : `<span>${(profile?.display_name || profile?.username || "?").charAt(0).toUpperCase()}</span>`
                    }
                </div>
                <div class="people-meta">
                    <strong>${escapeHTML(profile?.display_name || profile?.username || "User")}</strong>
                    <span>@${escapeHTML(profile?.username || "—")}</span>
                </div>
            </div>
            <div class="people-actions">
                <button class="secondary" onclick="loadChat('${f.following_id}'); event.stopPropagation();">Message</button>
                <button class="secondary" onclick="unfollowUser('${f.following_id}'); event.stopPropagation();">Unfollow</button>
            </div>
        `;
        container.appendChild(row);
    });
}


// ============================================================
// PUBLIC PROFILE
// ============================================================

let currentPublicProfileId = null;

async function loadPublicProfile(userId) {
    if (!currentUser) return;
    currentPublicProfileId = userId;

    const { data: profile, error } = await supabaseClient
        .from("Profiles")
        .select("id, username, display_name, avatar_url, mkm_id, bio, status, created_at, company_license")
        .eq("id", userId)
        .maybeSingle();

    if (error || !profile) {
        alert("User not found.");
        return;
    }

    // Set display
    setText("public-profile-display-name", profile.display_name || profile.username || "—");
    setText("public-profile-username", profile.username ? `@${profile.username}` : "@—");
    setText("public-profile-status", profile.status || "Active");
    setText("public-profile-bio", profile.bio || "No bio.");
    setText("public-profile-mkm-id", profile.mkm_id || "—");
    setText("public-profile-created", formatDate(profile.created_at));

    // Avatar
    const avatar = document.getElementById("public-profile-avatar");
    const placeholder = document.getElementById("public-profile-avatar-placeholder");
    if (profile.avatar_url && avatar) {
        avatar.src = `${profile.avatar_url}?v=${Date.now()}`;
        avatar.classList.remove("hidden");
        placeholder?.classList.add("hidden");
    } else {
        avatar?.classList.add("hidden");
        if (placeholder) {
            placeholder.classList.remove("hidden");
            placeholder.textContent = (profile.display_name || profile.username || "?").charAt(0).toUpperCase();
        }
    }

    // Button state
    const actionBtn = document.getElementById("public-profile-action");
    const msgBtn = document.getElementById("public-profile-message-btn");

    if (actionBtn) {
        const { data: isFollowing } = await supabaseClient
            .from("Follows")
            .select("id")
            .eq("follower_id", currentUser.id)
            .eq("following_id", userId)
            .maybeSingle();

        const { data: isRequested } = await supabaseClient
            .from("FollowRequests")
            .select("id")
            .eq("sender_id", currentUser.id)
            .eq("receiver_id", userId)
            .eq("status", "pending")
            .maybeSingle();

        if (isFollowing) {
            actionBtn.textContent = "Following";
            actionBtn.onclick = () => unfollowUser(userId);
            actionBtn.className = "secondary";
        } else if (isRequested) {
            actionBtn.textContent = "Requested";
            actionBtn.onclick = () => cancelFollowRequest(userId);
            actionBtn.className = "secondary";
        } else {
            actionBtn.textContent = "Follow";
            actionBtn.onclick = () => sendFollowRequest(userId);
            actionBtn.className = "";
        }
    }

    if (msgBtn) {
        msgBtn.onclick = () => loadChat(userId);
        msgBtn.classList.remove("hidden");
    }

    const msgEl = document.getElementById("public-profile-message");
    if (msgEl) msgEl.textContent = "";

    showPage("public-profile");
}


// ============================================================
// CHAT / MESSAGES
// ============================================================

async function loadMessages() {
    if (!currentUser) { await checkSession(); return; }
    await renderConversationList();
    showPage("messages-page");
}

async function renderConversationList() {
    const container = document.getElementById("conversations-list");
    if (!container) return;

    // Get all messages and group by partner
    const { data: messages, error } = await supabaseClient
        .from("Messages")
        .select("sender_id, receiver_id, content, read, created_at")
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order("created_at", { ascending: false });

    if (error) {
        container.innerHTML = "<p>Could not load conversations.</p>";
        return;
    }

    if (!messages || !messages.length) {
        container.innerHTML = "<p style=\"color:#94a3b8;\">No messages yet. Start a chat from someone's profile!</p>";
        return;
    }

    // Group by partner, keep latest message per partner
    const conversations = {};
    messages.forEach(msg => {
        const partnerId = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
        if (!conversations[partnerId]) {
            conversations[partnerId] = { partnerId, latest: msg, unread: 0 };
        }
        if (msg.receiver_id === currentUser.id && !msg.read) {
            conversations[partnerId].unread++;
        }
    });

    // Get partner profiles
    const partnerIds = Object.keys(conversations);
    const { data: profiles } = await supabaseClient
        .from("Profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", partnerIds);

    const profileMap = {};
    (profiles || []).forEach(p => profileMap[p.id] = p);

    container.innerHTML = "";
    Object.values(conversations).forEach(conv => {
        const profile = profileMap[conv.partnerId];
        const row = document.createElement("div");
        row.className = "conversation-row";
        row.onclick = () => loadChat(conv.partnerId);

        const name = escapeHTML(profile?.display_name || profile?.username || "User");
        const preview = escapeHTML(conv.latest.content).substring(0, 40) + (conv.latest.content.length > 40 ? "..." : "");
        const time = formatDateTime(conv.latest.created_at);
        const unreadBadge = conv.unread > 0 ? `<span class="unread-badge">${conv.unread}</span>` : "";

        row.innerHTML = `
            <div class="people-avatar">
                ${profile?.avatar_url
                    ? `<img src="${escapeHTML(profile.avatar_url)}" alt="">`
                    : `<span>${name.charAt(0).toUpperCase()}</span>`
                }
            </div>
            <div class="conversation-meta">
                <div class="conversation-header">
                    <strong>${name}</strong>
                    <span class="conversation-time">${time}</span>
                </div>
                <div class="conversation-preview">
                    ${preview} ${unreadBadge}
                </div>
            </div>
        `;
        container.appendChild(row);
    });
}

async function loadChat(partnerId) {
    if (!currentUser) return;
    currentChatPartner = partnerId;

    // Get partner info
    const { data: profile } = await supabaseClient
        .from("Profiles")
        .select("username, display_name, avatar_url")
        .eq("id", partnerId)
        .maybeSingle();

    setText("chat-partner-name", profile?.display_name || profile?.username || "Chat");
    setText("chat-partner-username", profile?.username ? `@${profile.username}` : "");

    const avatar = document.getElementById("chat-partner-avatar");
    const placeholder = document.getElementById("chat-partner-avatar-placeholder");
    if (profile?.avatar_url && avatar) {
        avatar.src = profile.avatar_url;
        avatar.classList.remove("hidden");
        placeholder?.classList.add("hidden");
    } else {
        avatar?.classList.add("hidden");
        if (placeholder) {
            placeholder.classList.remove("hidden");
            placeholder.textContent = (profile?.display_name || profile?.username || "?").charAt(0).toUpperCase();
        }
    }

    await renderChatMessages();
    await markMessagesRead(partnerId);
    subscribeToMessages();
    showPage("chat-page");
}

async function renderChatMessages() {
    const container = document.getElementById("chat-messages");
    if (!container || !currentChatPartner) return;

    const { data: messages, error } = await supabaseClient
        .from("Messages")
        .select("sender_id, receiver_id, content, read, created_at")
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatPartner}),and(sender_id.eq.${currentChatPartner},receiver_id.eq.${currentUser.id})`)
        .order("created_at", { ascending: true });

    if (error) {
        container.innerHTML = "<p>Could not load messages.</p>";
        return;
    }

    container.innerHTML = "";
    (messages || []).forEach(msg => {
        const isMe = msg.sender_id === currentUser.id;
        const bubble = document.createElement("div");
        bubble.className = `chat-bubble ${isMe ? "chat-me" : "chat-them"}`;
        bubble.innerHTML = `
            <div class="chat-content">${escapeHTML(msg.content)}</div>
            <div class="chat-time">${formatDateTime(msg.created_at)} ${isMe && msg.read ? "· Read" : ""}</div>
        `;
        container.appendChild(bubble);
    });

    container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
    const input = document.getElementById("chat-input");
    const content = input?.value.trim();

    if (!content || !currentChatPartner || !currentUser) return;

    try {
        const { data, error } = await supabaseClient.rpc("send_message", {
            p_receiver_id: currentChatPartner,
            p_content: content
        });
        if (error) throw error;
        if (data.success) {
            input.value = "";
            await renderChatMessages();
        }
    } catch (err) {
        console.error("Send message error:", err);
    }
}

function subscribeToMessages() {
    if (messageSubscription) {
        supabaseClient.removeChannel(messageSubscription);
        messageSubscription = null;
    }

    messageSubscription = supabaseClient
        .channel("messages-" + currentChatPartner)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "Messages",
                filter: `receiver_id=eq.${currentUser.id}`
            },
            async () => {
                await renderChatMessages();
                await markMessagesRead(currentChatPartner);
            }
        )
        .subscribe();
}

async function markMessagesRead(partnerId) {
    if (!currentUser || !partnerId) return;
    try {
        await supabaseClient.rpc("mark_messages_read", {
            p_partner_id: partnerId
        });
    } catch (err) {
        console.error("Mark read error:", err);
    }
}


// ============================================================
// ADMIN: COMPANY REQUESTS
// ============================================================

async function loadAdminRequests() {
    if (!currentUser || currentUser.id !== MKM_OWNER_ID) return;

    const { data: requests, error } = await supabaseClient
        .from("CompanyRequests")
        .select(`
            id,
            user_id,
            name,
            symbol,
            category,
            requested_shares,
            status,
            created_at
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

    if (error) { console.error(error); return; }

    const container = document.getElementById("admin-requests-list");
    if (!container) return;

    if (!requests || !requests.length) {
        container.innerHTML = "<p style=\"color:#94a3b8;\">No pending requests.</p>";
        return;
    }

    container.innerHTML = "";
    requests.forEach(req => {
        const row = document.createElement("div");
        row.className = "request-row";
        row.innerHTML = `
            <div>
                <strong>${escapeHTML(req.name)} (${escapeHTML(req.symbol)})</strong>
                <span>${formatCategory(req.category)} · ${formatNumber(req.requested_shares)} shares · by ${escapeHTML(req.user_id?.substring(0,8) || "user")}</span>
            </div>
            <div class="request-actions">
                <input type="number" id="req-price-${req.id}" placeholder="Price €" min="0.01" step="0.01" style="width:100px;">
                <input type="number" id="req-shares-${req.id}" placeholder="Shares" min="1" step="1" style="width:100px;" value="${req.requested_shares}">
                <button onclick="approveCompanyRequest('${req.id}')">Approve</button>
                <button class="secondary" onclick="rejectCompanyRequest('${req.id}')">Reject</button>
            </div>
        `;
        container.appendChild(row);
    });
}

async function approveCompanyRequest(requestId) {
    if (!currentUser || currentUser.id !== MKM_OWNER_ID) return;

    const priceInput = document.getElementById(`req-price-${requestId}`);
    const sharesInput = document.getElementById(`req-shares-${requestId}`);
    const price = Number(priceInput?.value);
    const shares = Number(sharesInput?.value);

    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(shares) || shares <= 0) {
        alert("Enter valid price and shares.");
        return;
    }

    try {
        const { data, error } = await supabaseClient.rpc("approve_company_request", {
            p_request_id: requestId,
            p_starting_price: price,
            p_approved_shares: shares
        });
        if (error) throw error;

        if (data.success) {
            alert(data.message);

            /*
             * Ensure the new asset has a proper day open
             * so percentage change is meaningful from day one.
             */
            const { data: req } = await supabaseClient
                .from("CompanyRequests")
                .select("symbol")
                .eq("id", requestId)
                .maybeSingle();

            if (req?.symbol) {
                const { data: asset } = await supabaseClient
                    .from("Assets")
                    .select("id, price")
                    .eq("symbol", req.symbol)
                    .eq("price", price)
                    .maybeSingle();

                if (asset) {
                    await supabaseClient
                        .from("Assets")
                        .update({
                            day_open_price: price,
                            last_day_reset: new Date().toISOString()
                        })
                        .eq("id", asset.id);

                    /*
                     * Seed the first price history row so
                     * the chart has data to display immediately.
                     */
                    await recordPriceHistory(
                        asset.id,
                        asset.price,
                        asset.price
                    );
                }
            }

            await loadAdminRequests();
            await loadAdminAssets();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert(err.message || "Approval failed.");
    }
}

async function rejectCompanyRequest(requestId) {
    if (!currentUser || currentUser.id !== MKM_OWNER_ID) return;

    const reason = prompt("Reason for rejection (optional):");
    if (reason === null) return;

    try {
        const { data, error } = await supabaseClient.rpc("reject_company_request", {
            p_request_id: requestId,
            p_reason: reason || ""
        });
        if (error) throw error;

        if (data.success) {
            await loadAdminRequests();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert(err.message || "Rejection failed.");
    }
}


// ============================================================
// GLOBAL SESSION LISTENER
// ============================================================

supabaseClient.auth.onAuthStateChange(
    async (event, session) => {

        if (session?.user) {

            currentUser =
                session.user;

        } else {

            currentUser = null;
            currentProfile = null;
        }
    }
);


// ============================================================
// FORM LISTENERS
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const signupForm =
            document.getElementById(
                "signup-form"
            );

        if (signupForm) {

            signupForm.addEventListener(
                "submit",
                async event => {

                    event.preventDefault();

                    const username =
                        document.getElementById(
                            "username"
                        ).value.trim();

                    const email =
                        document.getElementById(
                            "email"
                        ).value.trim();

                    const password =
                        document.getElementById(
                            "password"
                        ).value;

                    await register(
                        username,
                        email,
                        password
                    );
                }
            );
        }

        const loginForm =
            document.getElementById(
                "login-form"
            );

        if (loginForm) {

            loginForm.addEventListener(
                "submit",
                async event => {

                    event.preventDefault();

                    const email =
                        document.getElementById(
                            "login-email"
                        ).value.trim();

                    const password =
                        document.getElementById(
                            "login-password"
                        ).value;

                    await login(
                        email,
                        password
                    );
                }
            );
        }

        /*
         * Trade preview updates immediately while typing.
         */
        const tradeShares =
            document.getElementById(
                "trade-shares"
            );

        tradeShares?.addEventListener(
            "input",
            updateTradePreview
        );

        /*
         * Admin category selector — dynamic form fields
         */
        const companyCategory =
            document.getElementById(
                "company-category"
            );

        companyCategory?.addEventListener(
            "change",
            updateCompanyFormForCategory
        );

        /*
         * Initialise admin form on first load
         */
        updateCompanyFormForCategory();

        /*
         * Submit company request form
         */
        const establishForm =
            document.getElementById(
                "establish-form"
            );

        establishForm?.addEventListener(
            "submit",
            submitCompanyRequest
        );

        /*
         * Redemption code form (admin)
         */
        const redeemCodeForm =
            document.getElementById(
                "redeem-code-form"
            );

        redeemCodeForm?.addEventListener(
            "submit",
            createRedemptionCode
        );

        /*
         * Redeem code on Enter key
         */
        const redeemInput =
            document.getElementById(
                "redeem-code-input"
            );

        redeemInput?.addEventListener(
            "keydown",
            event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    redeemCode();
                }
            }
        );

        /*
         * People search on Enter
         */
        const peopleSearch =
            document.getElementById(
                "people-search"
            );

        peopleSearch?.addEventListener(
            "keydown",
            event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    searchPeople();
                }
            }
        );

        /*
         * Chat input on Enter
         */
        const chatInput =
            document.getElementById(
                "chat-input"
            );

        chatInput?.addEventListener(
            "keydown",
            event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    sendChatMessage();
                }
            }
        );
    }
);


// ============================================================
// HELPERS
// ============================================================

function setText(
    elementId,
    value
) {

    const element =
        document.getElementById(
            elementId
        );

    if (element) {
        element.textContent =
            value;
    }
}


function getTrendColor(value) {

    const number =
        Number(value || 0);

    if (number > 0) {
        return "#22c55e";
    }

    if (number < 0) {
        return "#ef4444";
    }

    return "#94a3b8";
}


function applyTrendStyle(
    element,
    value
) {

    if (!element) {
        return;
    }

    const number =
        Number(value || 0);

    element.classList.remove(
        "positive",
        "negative",
        "neutral"
    );

    if (number > 0) {

        element.classList.add(
            "positive"
        );

    } else if (number < 0) {

        element.classList.add(
            "negative"
        );

    } else {

        element.classList.add(
            "neutral"
        );
    }

    element.style.color =
        getTrendColor(number);

    element.style.fontWeight =
        "700";
}


function formatMoney(value) {

    const number =
        Number(value || 0);

    return new Intl.NumberFormat(
        "en-GB",
        {
            style: "currency",
            currency: "EUR",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    ).format(number);
}


function formatSignedMoney(value) {

    const number =
        Number(value || 0);

    if (number > 0) {

        return `+${formatMoney(number)}`;
    }

    return formatMoney(number);
}


function formatPercent(value) {

    return `${Number(value || 0).toFixed(2)}%`;
}


function formatSignedPercent(value) {

    const number =
        Number(value || 0);

    if (number > 0) {

        return `+${number.toFixed(2)}%`;
    }

    return `${number.toFixed(2)}%`;
}


function formatNumber(value) {

    return new Intl.NumberFormat(
        "en-GB"
    ).format(
        Number(value || 0)
    );
}


function formatDate(value) {

    if (!value) {
        return "—";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "—";
    }

    return new Intl.DateTimeFormat(
        "en-GB",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    ).format(date);
}


function formatDateTime(value) {

    if (!value) {
        return "—";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "—";
    }

    return new Intl.DateTimeFormat(
        "en-GB",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    ).format(date);
}


function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        await checkSession();

        await startMarketTimer();
    }
);