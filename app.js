// ============================================================
// MKM HQ - APP.JS
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

let currentUser = null;
let currentProfile = null;
let currentAsset = null;

let marketAssets = [];
let currentMarketCategory = "all";

let chart = null;
let candleSeries = null;
let volumeSeries = null;

let currentChartPeriod = "1D";
let currentTradeSide = "buy";

let marketTimer = null;


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
                username: username,
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

    const adminButton =
        document.getElementById("admin-button");

    if (adminButton) {

        if (
            currentUser.id ===
            MKM_OWNER_ID
        ) {

            adminButton.classList.remove(
                "hidden"
            );

        } else {

            adminButton.classList.add(
                "hidden"
            );
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
            Number(
                position.Assets?.price || 0
            );

        const shares =
            Number(
                position.shares || 0
            );

        const average =
            Number(
                position.average_price || 0
            );

        const value =
            shares * price;

        const pnl =
            shares *
            (price - average);

        totalValue += value;
        totalPnl += pnl;
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
        formatMoney(
            profile?.balance || 0
        )
    );

    let totalValue = 0;
    let totalPnl = 0;

    const container =
        document.getElementById(
            "portfolio-list"
        );

    if (!container) {
        return;
    }

    if (!positions || positions.length === 0) {

        container.innerHTML =
            "<p>No positions yet.</p>";

    } else {

        container.innerHTML = "";

        positions.forEach(position => {

            const asset =
                position.Assets;

            if (!asset) {
                return;
            }

            const shares =
                Number(
                    position.shares || 0
                );

            const average =
                Number(
                    position.average_price || 0
                );

            const price =
                Number(
                    asset.price || 0
                );

            const value =
                shares * price;

            const pnl =
                shares *
                (price - average);

            totalValue += value;
            totalPnl += pnl;

            const row =
                document.createElement("div");

            row.className =
                "market-row";

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

                <div>
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
                () => loadAssetDetail(asset.id)
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
        document.getElementById(
            "transactions-list"
        );

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

    if (
        !transactions ||
        transactions.length === 0
    ) {

        container.innerHTML =
            "<p>No transactions yet.</p>";

        showPage("transactions-page");

        return;
    }

    container.innerHTML = "";

    transactions.forEach(transaction => {

        const row =
            document.createElement("div");

        row.className =
            "market-row";

        const side =
            String(
                transaction.side || ""
            ).toUpperCase();

        const sideClass =
            transaction.side === "buy"
                ? "positive"
                : "negative";

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

            <div class="${sideClass}">
                ${side}
            </div>

            <div>
                ${Number(transaction.shares || 0)} shares
            </div>

            <div>
                ${formatMoney(
                    transaction.price || 0
                )}
            </div>

            <div>
                ${formatMoney(
                    transaction.total || 0
                )}
            </div>

            <div>
                ${formatDateTime(
                    transaction.created_at
                )}
            </div>
        `;

        container.appendChild(row);
    });

    showPage("transactions-page");
}


// ------------------------------------------------------------
// PROFILE
// ------------------------------------------------------------

async function loadProfile() {

    if (!currentProfile) {
        await loadDashboard();
    }

    if (!currentProfile) {
        return;
    }

    setText(
        "profile-username",
        currentProfile.username || "—"
    );

    setText(
        "profile-display-name",
        currentProfile.display_name || "—"
    );

    setText(
        "profile-mkm-id",
        currentProfile.mkm_id || "—"
    );

    setText(
        "profile-status",
        currentProfile.status || "—"
    );

    setText(
        "profile-bio",
        currentProfile.bio || "No bio."
    );

    showPage("profile-page");
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

    marketAssets =
        assets || [];

    renderMarket();

    showPage("market");
}


function renderMarket() {

    const searchInput =
        document.getElementById(
            "market-search"
        );

    const search =
        (
            searchInput?.value ||
            ""
        )
        .trim()
        .toLowerCase();

    let assets =
        [...marketAssets];

    if (
        currentMarketCategory !==
        "all"
    ) {

        assets =
            assets.filter(
                asset =>
                    String(
                        asset.category ||
                        ""
                    ).toLowerCase() ===
                    currentMarketCategory
            );
    }

    if (search) {

        assets =
            assets.filter(asset => {

                const name =
                    String(
                        asset.name || ""
                    ).toLowerCase();

                const symbol =
                    String(
                        asset.symbol || ""
                    ).toLowerCase();

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

    currentMarketCategory =
        category;

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
                Number(
                    asset.market_cap || 0
                ),
            0
        );

    const totalVolume =
        assets.reduce(
            (sum, asset) =>
                sum +
                Number(
                    asset.volume || 0
                ),
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


function renderMovers(assets) {

    const ranked =
        assets
            .map(asset => {

                const price =
                    Number(
                        asset.price || 0
                    );

                const previous =
                    Number(
                        asset.previous_price ||
                        price
                    );

                const change =
                    previous === 0
                        ? 0
                        : (
                            (
                                price -
                                previous
                            ) /
                            previous
                        ) *
                        100;

                return {
                    ...asset,
                    change
                };
            })
            .sort(
                (a, b) =>
                    b.change -
                    a.change
            );

    const gainers =
        ranked
            .filter(
                asset =>
                    asset.change > 0
            )
            .slice(0, 5);

    const losers =
        ranked
            .filter(
                asset =>
                    asset.change < 0
            )
            .sort(
                (a, b) =>
                    a.change -
                    b.change
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
        document.getElementById(
            elementId
        );

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

        const row =
            document.createElement("div");

        row.className =
            "mover-row";

        row.innerHTML = `
            <div>
                <strong>
                    ${escapeHTML(asset.symbol)}
                </strong>

                <span>
                    ${escapeHTML(asset.name)}
                </span>
            </div>

            <div>
                ${formatMoney(asset.price)}
            </div>

            <div>
                ${formatSignedPercent(
                    asset.change
                )}
            </div>
        `;

        row.addEventListener(
            "click",
            () => loadAssetDetail(asset.id)
        );

        container.appendChild(row);
    });
}


function renderMarketList(assets) {

    const container =
        document.getElementById(
            "market-list"
        );

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
            Number(
                asset.price || 0
            );

        const previous =
            Number(
                asset.previous_price ||
                price
            );

        const change =
            previous === 0
                ? 0
                : (
                    (
                        price -
                        previous
                    ) /
                    previous
                ) *
                100;

        const row =
            document.createElement("div");

        row.className =
            "market-row";

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

            <div>
                ${formatSignedPercent(change)}
            </div>

            <div>
                ${formatMoney(
                    asset.market_cap || 0
                )}
            </div>

            <div>
                ${formatNumber(
                    asset.volume || 0
                )}
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
            document.getElementById(
                "market-search"
            );

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

        alert(
            "Asset not found."
        );

        return;
    }

    currentAsset =
        asset;

    setText(
        "asset-name",
        asset.name
    );

    setText(
        "asset-symbol",
        asset.symbol
    );

    setText(
        "asset-category",
        asset.category
    );

    setText(
        "asset-category-stat",
        asset.category
    );

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
        formatMoney(
            asset.market_cap || 0
        )
    );

    setText(
        "asset-volume",
        formatNumber(
            asset.volume || 0
        )
    );

    setText(
        "asset-description",
        asset.description ||
        "No description available."
    );

    updateAssetChange(asset);

    await loadTradePosition();

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

    const price =
        Number(
            asset.price || 0
        );

    const previous =
        Number(
            asset.previous_price ||
            price
        );

    const change =
        previous === 0
            ? 0
            : (
                (
                    price -
                    previous
                ) /
                previous
            ) *
            100;

    setText(
        "asset-change",
        formatSignedPercent(change)
    );
}


// ============================================================
// TRADING
// ============================================================

function setTradeSide(side) {

    currentTradeSide =
        side;

    const buyTab =
        document.getElementById(
            "buy-tab"
        );

    const sellTab =
        document.getElementById(
            "sell-tab"
        );

    const submit =
        document.getElementById(
            "trade-submit"
        );

    if (side === "buy") {

        buyTab?.classList.add(
            "active"
        );

        sellTab?.classList.remove(
            "active"
        );

        if (submit) {
            submit.textContent =
                "Buy";
        }

    } else {

        sellTab?.classList.add(
            "active"
        );

        buyTab?.classList.remove(
            "active"
        );

        if (submit) {
            submit.textContent =
                "Sell";
        }
    }

    clearTradeMessage();

    updateTradePreview();
}


async function loadTradePosition() {

    if (
        !currentUser ||
        !currentAsset
    ) {
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
        Number(
            position?.shares || 0
        );

    const average =
        Number(
            position?.average_price || 0
        );

    const price =
        Number(
            currentAsset.price || 0
        );

    const value =
        shares * price;

    const pnl =
        shares *
        (price - average);

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
        formatMoney(
            profile?.balance || 0
        )
    );
}


function updateTradePreview() {

    if (!currentAsset) {
        return;
    }

    const sharesInput =
        document.getElementById(
            "trade-shares"
        );

    const shares =
        Math.max(
            0,
            Number(
                sharesInput?.value || 0
            )
        );

    const price =
        Number(
            currentAsset.price || 0
        );

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
        document.getElementById(
            "trade-shares"
        );

    const shares =
        Number(
            input?.value || 0
        );

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
        Number(
            currentAsset.price || 0
        );

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
        document.getElementById(
            "trade-submit"
        );

    if (submit) {

        submit.disabled = true;

        submit.textContent =
            "Processing...";
    }

    clearTradeMessage();

    try {

        const {
            data,
            error
        } = await supabaseClient.rpc(
            "execute_trade",
            {
                p_asset_id:
                    currentAsset.id,

                p_side:
                    currentTradeSide,

                p_shares:
                    shares
            }
        );

        if (error) {
            throw error;
        }

        console.log(
            "Trade result:",
            data
        );

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
                "Not enough cash for this trade.";

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

    currentAsset =
        asset;

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
        formatMoney(
            asset.market_cap || 0
        )
    );

    setText(
        "asset-volume",
        formatNumber(
            asset.volume || 0
        )
    );

    updateAssetChange(asset);

    updateTradePreview();

    if (
        !document
            .getElementById("asset-detail")
            ?.classList.contains("hidden")
    ) {

        await loadChart();
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

    currentProfile =
        profile;

    setText(
        "balance",
        formatMoney(
            profile.balance || 0
        )
    );

    const portfolioValue =
        await calculatePortfolioValue();

    setText(
        "portfolio",
        formatMoney(
            portfolioValue.value
        )
    );

    setText(
        "pnl",
        formatSignedMoney(
            portfolioValue.pnl
        )
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
        document.getElementById(
            "trade-message"
        );

    if (!element) {
        return;
    }

    element.textContent =
        message;

    element.classList.toggle(
        "negative",
        Boolean(isError)
    );

    element.classList.toggle(
        "positive",
        !isError
    );
}


function clearTradeMessage() {

    const element =
        document.getElementById(
            "trade-message"
        );

    if (element) {

        element.textContent = "";

        element.classList.remove(
            "negative",
            "positive"
        );
    }
}


// ============================================================
// CHART
// ============================================================

async function loadChart() {

    const container =
        document.getElementById(
            "price-chart"
        );

    if (
        !container ||
        !currentAsset
    ) {
        return;
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

    if (
        typeof LightweightCharts ===
        "undefined"
    ) {

        container.innerHTML =
            "<p>Chart library unavailable.</p>";

        return;
    }

    chart =
        LightweightCharts.createChart(
            container,
            {
                width:
                    container.clientWidth ||
                    700,

                height: 420,

                layout: {
                    background: {
                        color: "transparent"
                    },

                    textColor:
                        "#9ca3af"
                },

                grid: {
                    vertLines: {
                        color:
                            "rgba(128,128,128,0.15)"
                    },

                    horzLines: {
                        color:
                            "rgba(128,128,128,0.15)"
                    }
                },

                rightPriceScale: {
                    borderColor:
                        "rgba(128,128,128,0.25)"
                },

                timeScale: {
                    borderColor:
                        "rgba(128,128,128,0.25)"
                }
            }
        );

    candleSeries =
        chart.addSeries(
            LightweightCharts.CandlestickSeries,
            {
                upColor: "#16a34a",
                downColor: "#dc2626",
                borderUpColor: "#16a34a",
                borderDownColor: "#dc2626",
                wickUpColor: "#16a34a",
                wickDownColor: "#dc2626"
            }
        );

    await loadChartData();

    if (typeof ResizeObserver !== "undefined") {

        const resizeObserver =
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
                            420
                        );
                    }
                }
            );

        resizeObserver.observe(
            container
        );
    }
}


async function loadChartData() {

    if (
        !currentAsset ||
        !candleSeries
    ) {
        return;
    }

    const periodStart =
        getChartStartDate(
            currentChartPeriod
        );

    const {
        data: history,
        error
    } = await supabaseClient
        .from("PriceHistory")
        .select("*")
        .eq(
            "asset_id",
            currentAsset.id
        )
        .gte(
            "recorded_at",
            periodStart.toISOString()
        )
        .order(
            "recorded_at",
            {
                ascending: true
            }
        );

    if (error) {

        console.error(
            "Chart history error:",
            error
        );

        return;
    }

    if (
        !history ||
        history.length === 0
    ) {

        candleSeries.setData([]);

        return;
    }

    const candles =
        buildCandles(
            history
        );

    candleSeries.setData(
        candles
    );

    if (chart) {
        chart.timeScale().fitContent();
    }
}


// ------------------------------------------------------------
// BUILD CANDLES
// ------------------------------------------------------------

function buildCandles(history) {

    const candles = [];

    history.forEach(row => {

        const time =
            Math.floor(
                new Date(
                    row.recorded_at
                ).getTime() /
                1000
            );

        const close =
            Number(
                row.close_price ??
                row.price ??
                0
            );

        const open =
            Number(
                row.open_price ??
                close
            );

        const high =
            Number(
                row.high_price ??
                Math.max(
                    open,
                    close
                )
            );

        const low =
            Number(
                row.low_price ??
                Math.min(
                    open,
                    close
                )
            );

        if (
            Number.isFinite(time) &&
            close > 0
        ) {

            candles.push({
                time,
                open,
                high,
                low,
                close
            });
        }
    });

    return candles;
}


// ------------------------------------------------------------
// CHART PERIOD
// ------------------------------------------------------------

function setChartPeriod(period) {

    currentChartPeriod =
        period;

    document
        .querySelectorAll(
            ".chart-periods button"
        )
        .forEach(button => {

            button.classList.remove(
                "active"
            );

            if (
                button.textContent
                    .trim() === period
            ) {

                button.classList.add(
                    "active"
                );
            }
        });

    loadChartData();
}


function getChartStartDate(period) {

    const now =
        new Date();

    const start =
        new Date(now);

    switch (period) {

        case "1D":

            start.setDate(
                now.getDate() - 1
            );

            break;

        case "1W":

            start.setDate(
                now.getDate() - 7
            );

            break;

        case "1M":

            start.setMonth(
                now.getMonth() - 1
            );

            break;

        case "3M":

            start.setMonth(
                now.getMonth() - 3
            );

            break;

        case "1Y":

            start.setFullYear(
                now.getFullYear() - 1
            );

            break;

        default:

            start.setFullYear(
                now.getFullYear() - 10
            );
    }

    return start;
}


// ============================================================
// ADMIN
// ============================================================

async function loadAdminPanel() {

    if (
        !currentUser ||
        currentUser.id !==
        MKM_OWNER_ID
    ) {

        alert(
            "Admin access denied."
        );

        return;
    }

    await loadAdminAssets();

    await loadMarketSettings();

    showPage("admin");
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
            Number(
                asset.market_cap || 0
            );

        if (list) {

            const row =
                document.createElement(
                    "div"
                );

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
                    ${formatMoney(
                        asset.market_cap || 0
                    )}
                </div>
            `;

            list.appendChild(row);
        }

        if (eventAsset) {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                asset.id;

            option.textContent =
                `${asset.symbol} — ${asset.name}`;

            eventAsset.appendChild(
                option
            );
        }
    });

    setText(
        "admin-asset-count",
        assets?.length || 0
    );

    setText(
        "admin-market-cap",
        formatMoney(
            totalMarketCap
        )
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

                const shares =
                    Number(
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
                            market_cap:
                                price * shares,
                            volume: 0,
                            description:
                                ""
                        })
                        .select()
                        .single();

                    if (error) {
                        throw error;
                    }

                    await recordPriceHistory(
                        data.id,
                        price
                    );

                    if (message) {
                        message.textContent =
                            "Company added successfully.";
                    }

                    companyForm.reset();

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
        currentUser.id !==
        MKM_OWNER_ID
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
}


// ============================================================
// MARKET EVENTS
// ============================================================

async function createMarketEvent() {

    if (
        !currentUser ||
        currentUser.id !==
        MKM_OWNER_ID
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
        )
        .toISOString();

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

    const previous =
        previousPrice === null
            ? close
            : Number(previousPrice);

    const {
        error
    } = await supabaseClient
        .from("PriceHistory")
        .insert({
            asset_id: assetId,
            price: close,
            open_price: previous,
            high_price:
                Math.max(
                    previous,
                    close
                ),
            low_price:
                Math.min(
                    previous,
                    close
                ),
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
                ?.classList.contains(
                    "hidden"
                ) === false
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

    const maxMovement =
        Number(
            settings.max_normal_movement_percent ||
            1
        );

    let movement =
        (
            Math.random() * 2 - 1
        ) *
        maxMovement;

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

        if (
            event.strength ===
            "low"
        ) {

            multiplier = 1.5;

        } else if (
            event.strength ===
            "medium"
        ) {

            multiplier = 2.5;

        } else if (
            event.strength ===
            "high"
        ) {

            multiplier = 4;
        }

        movement =
            Math.abs(movement) *
            multiplier *
            (
                event.direction ===
                "up"
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
            minutes *
            60 *
            1000
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
        document.getElementById(
            "news-list"
        );

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
            document.createElement(
                "div"
            );

        card.className =
            "card";

        card.innerHTML = `
            <h2>
                ${escapeHTML(
                    article.headline
                )}
            </h2>

            <p>
                ${escapeHTML(
                    article.content
                )}
            </p>

            <small>
                ${article.Assets
                    ? escapeHTML(
                        article.Assets.symbol
                    )
                    : "MKM HQ"
                }
                ·
                ${formatDateTime(
                    article.created_at
                )}
            </small>
        `;

        container.appendChild(card);
    });

    showPage("news");
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

    return String(
        value ?? ""
    )
    .replace(
        /&/g,
        "&amp;"
    )
    .replace(
        /</g,
        "&lt;"
    )
    .replace(
        />/g,
        "&gt;"
    )
    .replace(
        /"/g,
        "&quot;"
    )
    .replace(
        /'/g,
        "&#039;"
    );
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

