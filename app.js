// ============================================================
// MKM HQ - APP.JS
// Supabase + Market + Admin + Interactive Candlestick Charts
// ============================================================

console.log("MKM app.js loaded");

const SUPABASE_URL = "https://yvrtjegyfschjflhmgwb.supabase.co";
const SUPABASE_KEY = "sb_publishable_k8Rwx4wS7_VV-Iiqgt7wYg_W1IFh8P-";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

const MKM_OWNER_ID = "dbba8502-f01b-4e86-aa42-aa5899ce771d";

let currentUser = null;
let marketAssets = [];
let selectedMarketCategory = "All";

let currentChart = null;
let currentChartSeries = null;
let currentChartAssetId = null;
let currentChartPeriod = "1D";
let chartResizeObserver = null;


// ============================================================
// PAGE NAVIGATION
// ============================================================

function showPage(pageId) {
    document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active");
        page.classList.add("hidden");
    });

    const page = document.getElementById(pageId);

    if (page) {
        page.classList.remove("hidden");
        page.classList.add("active");
    }

    window.scrollTo(0, 0);

    if (pageId === "dashboard") {
        loadDashboard();
    }

    if (pageId === "market") {
        loadMarketData();
    }

    if (pageId === "admin") {
        loadAdminData();
    }
}


// ============================================================
// OWNER / ADMIN ACCESS
// ============================================================

function isMKMOwner(user) {
    return user && user.id === MKM_OWNER_ID;
}

function setupAdminAccess(user) {
    const adminButtons = document.querySelectorAll(
        ".admin-link, [data-page='admin']"
    );

    adminButtons.forEach(button => {
        button.style.display =
            isMKMOwner(user) ? "" : "none";
    });

    // Your current HTML has the admin button as a normal
    // .action button without an admin class.
    // Find it by its text and show it only to the owner.
    document.querySelectorAll(".action").forEach(button => {
        if (
            button.textContent
                .trim()
                .toLowerCase() === "admin panel"
        ) {
            button.style.display =
                isMKMOwner(user) ? "" : "none";
        }
    });
}


// ============================================================
// REGISTER
// ============================================================

async function register() {
    const username =
        document.getElementById("username")?.value.trim();

    const email =
        document.getElementById("email")?.value.trim();

    const password =
        document.getElementById("password")?.value;

    const message =
        document.getElementById("signup-message");

    if (message) {
        message.textContent = "";
    }

    if (!username || !email || !password) {
        if (message) {
            message.textContent =
                "Please fill in all fields.";
        }

        return;
    }

    try {
        const { data, error } =
            await supabaseClient.auth.signUp({
                email,
                password
            });

        if (error) {
            console.error(
                "Registration error:",
                error
            );

            if (message) {
                message.textContent =
                    error.message;
            }

            return;
        }

        if (!data.user) {
            if (message) {
                message.textContent =
                    "Account created. Please check your email.";
            }

            return;
        }

        const { error: profileError } =
            await supabaseClient
                .from("Profiles")
                .insert({
                    id: data.user.id,
                    username: username,
                    display_name: username,
                    balance: 100000,
                    status: "active"
                });

        if (profileError) {
            console.error(
                "Profile creation error:",
                profileError
            );

            if (message) {
                message.textContent =
                    "Account created, but your profile could not be created.";
            }

            return;
        }

        if (message) {
            message.textContent =
                "Account created successfully!";
        }

        document
            .getElementById("signup-form")
            ?.reset();

        setTimeout(() => {
            showPage("login");
        }, 1000);

    } catch (error) {
        console.error(
            "Unexpected registration error:",
            error
        );

        if (message) {
            message.textContent =
                "Something went wrong while creating your account.";
        }
    }
}


// ============================================================
// LOGIN
// ============================================================

async function login() {
    console.log("LOGIN FUNCTION RAN");

    const email =
        document.getElementById("login-email")?.value.trim();

    const password =
        document.getElementById("login-password")?.value;

    const message =
        document.getElementById("login-message");

    if (message) {
        message.textContent = "";
    }

    if (!email || !password) {
        if (message) {
            message.textContent =
                "Please enter your email and password.";
        }

        return;
    }

    try {
        const { data, error } =
            await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

        if (error) {
            console.error(
                "Login error:",
                error
            );

            if (message) {
                message.textContent =
                    error.message;
            }

            return;
        }

        currentUser = data.user;

        setupAdminAccess(currentUser);

        document
            .getElementById("login-form")
            ?.reset();

        showPage("dashboard");

    } catch (error) {
        console.error(
            "Unexpected login error:",
            error
        );

        if (message) {
            message.textContent =
                "Something went wrong while logging in.";
        }
    }
}


// ============================================================
// FORM SETUP
// ============================================================

function setupForms() {
    const signupForm =
        document.getElementById("signup-form");

    if (signupForm) {
        signupForm.addEventListener(
            "submit",
            async event => {
                event.preventDefault();
                await register();
            }
        );
    }

    const loginForm =
        document.getElementById("login-form");

    if (loginForm) {
        loginForm.addEventListener(
            "submit",
            async event => {
                event.preventDefault();
                await login();
            }
        );
    }

    const companyForm =
        document.getElementById("company-form");

    if (companyForm) {
        companyForm.addEventListener(
            "submit",
            async event => {
                event.preventDefault();
                await addCompany();
            }
        );
    }
}


// ============================================================
// LOGOUT
// ============================================================

async function logout() {
    const { error } =
        await supabaseClient.auth.signOut();

    if (error) {
        console.error(
            "Logout error:",
            error
        );
    }

    currentUser = null;

    setupAdminAccess(null);

    showPage("landing");
}


// ============================================================
// SESSION
// ============================================================

async function checkSession() {
    const { data, error } =
        await supabaseClient.auth.getSession();

    if (error) {
        console.error(
            "Session error:",
            error
        );

        showPage("landing");
        return;
    }

    currentUser =
        data.session?.user || null;

    setupAdminAccess(currentUser);

    if (currentUser) {
        showPage("dashboard");
    } else {
        showPage("landing");
    }
}


supabaseClient.auth.onAuthStateChange(
    (_event, session) => {
        currentUser =
            session?.user || null;

        setupAdminAccess(currentUser);
    }
);


// ============================================================
// DASHBOARD
// ============================================================

async function loadDashboard() {
    if (!currentUser) {
        return;
    }

    const { data: profile, error } =
        await supabaseClient
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

    if (!profile) {
        console.warn(
            "No profile found."
        );

        return;
    }

    const usernameElement =
        document.getElementById(
            "dashboard-username"
        );

    if (usernameElement) {
        usernameElement.textContent =
            profile.display_name ||
            profile.username ||
            "Member";
    }

    const mkmIdElement =
        document.getElementById(
            "dashboard-mkm-id"
        );

    if (mkmIdElement) {
        mkmIdElement.textContent =
            profile.mkm_id ||
            "MKM-000000";
    }

    const balanceElement =
        document.getElementById(
            "balance"
        );

    if (balanceElement) {
        balanceElement.textContent =
            formatMoney(
                profile.balance || 0
            );
    }

    const portfolioElement =
        document.getElementById(
            "portfolio"
        );

    if (portfolioElement) {
        portfolioElement.textContent =
            formatMoney(
                profile.balance || 0
            );
    }

    const pnlElement =
        document.getElementById(
            "pnl"
        );

    if (pnlElement) {
        pnlElement.textContent =
            "+€0.00";
    }

    const statusElement =
        document.getElementById(
            "account-status"
        );

    if (statusElement) {
        statusElement.textContent =
            profile.status ||
            "Member";
    }

    const accountUsername =
        document.getElementById(
            "account-username"
        );

    if (accountUsername) {
        accountUsername.textContent =
            profile.username ||
            "—";
    }

    const createdElement =
        document.getElementById(
            "account-created"
        );

    if (createdElement) {
        if (profile.created_at) {
            createdElement.textContent =
                new Date(
                    profile.created_at
                ).toLocaleDateString();
        } else {
            createdElement.textContent =
                "—";
        }
    }
}


// ============================================================
// MONEY FORMATTING
// ============================================================

function formatMoney(value) {
    const number =
        Number(value) || 0;

    return new Intl.NumberFormat(
        "en-US",
        {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 2
        }
    ).format(number);
}


function formatCompactMoney(value) {
    const number =
        Number(value) || 0;

    if (number >= 1e12) {
        return (
            "$" +
            (number / 1e12).toFixed(2) +
            "T"
        );
    }

    if (number >= 1e9) {
        return (
            "$" +
            (number / 1e9).toFixed(2) +
            "B"
        );
    }

    if (number >= 1e6) {
        return (
            "$" +
            (number / 1e6).toFixed(2) +
            "M"
        );
    }

    if (number >= 1e3) {
        return (
            "$" +
            (number / 1e3).toFixed(2) +
            "K"
        );
    }

    return (
        "$" +
        number.toFixed(2)
    );
}


// ============================================================
// MARKET
// ============================================================

async function loadMarket() {
    showPage("market");
}


async function loadMarketData() {
    const list =
        document.getElementById(
            "market-list"
        );

    if (list) {
        list.innerHTML =
            `<div class="empty-state">
                Loading market data...
            </div>`;
    }

    const { data, error } =
        await supabaseClient
            .from("Assets")
            .select("*")
            .order(
                "market_cap",
                {
                    ascending: false
                }
            );

    if (error) {
        console.error(
            "Market error:",
            error
        );

        if (list) {
            list.innerHTML =
                `<div class="empty-state">
                    Unable to load market data.
                </div>`;
        }

        return;
    }

    marketAssets =
        data || [];

    renderMarket();
}


function renderMarket() {
    renderOverview();
    renderMovers();
    renderAssetList();
}


// ============================================================
// MARKET OVERVIEW
// ============================================================

function renderOverview() {
    const countElement =
        document.getElementById(
            "market-count"
        );

    const capElement =
        document.getElementById(
            "market-cap"
        );

    const volumeElement =
        document.getElementById(
            "market-volume"
        );

    const filtered =
        getFilteredMarketAssets();

    if (countElement) {
        countElement.textContent =
            filtered.length;
    }

    const totalCap =
        filtered.reduce(
            (sum, asset) =>
                sum +
                (
                    Number(
                        asset.market_cap
                    ) || 0
                ),
            0
        );

    const totalVolume =
        filtered.reduce(
            (sum, asset) =>
                sum +
                (
                    Number(
                        asset.volume
                    ) || 0
                ),
            0
        );

    if (capElement) {
        capElement.textContent =
            formatCompactMoney(
                totalCap
            );
    }

    if (volumeElement) {
        volumeElement.textContent =
            formatCompactMoney(
                totalVolume
            );
    }
}


// ============================================================
// MARKET MOVERS
// ============================================================

function getChange(asset) {
    const price =
        Number(asset.price) || 0;

    const previous =
        Number(
            asset.previous_price
        ) || 0;

    if (!previous) {
        return 0;
    }

    return (
        (
            price - previous
        ) /
        previous
    ) * 100;
}


function renderMovers() {
    const gainersList =
        document.getElementById(
            "gainers-list"
        );

    const losersList =
        document.getElementById(
            "losers-list"
        );

    const filtered =
        getFilteredMarketAssets();

    const sorted =
        [...filtered].sort(
            (a, b) =>
                getChange(b) -
                getChange(a)
        );

    const gainers =
        sorted
            .filter(
                asset =>
                    getChange(asset) > 0
            )
            .slice(0, 5);

    const losers =
        sorted
            .filter(
                asset =>
                    getChange(asset) < 0
            )
            .slice(0, 5);

    if (gainersList) {
        if (!gainers.length) {
            gainersList.innerHTML =
                `<div class="empty-state">
                    No gainers
                </div>`;
        } else {
            gainersList.innerHTML =
                gainers
                    .map(
                        asset =>
                            moverHTML(
                                asset,
                                true
                            )
                    )
                    .join("");
        }
    }

    if (losersList) {
        if (!losers.length) {
            losersList.innerHTML =
                `<div class="empty-state">
                    No losers
                </div>`;
        } else {
            losersList.innerHTML =
                losers
                    .map(
                        asset =>
                            moverHTML(
                                asset,
                                false
                            )
                    )
                    .join("");
        }
    }
}


function moverHTML(
    asset,
    positive
) {
    const change =
        getChange(asset);

    return `
        <div
            class="mover-row"
            onclick="openAsset('${asset.id}')"
        >

            <div>
                <strong>
                    ${escapeHTML(
                        asset.symbol || ""
                    )}
                </strong>

                <span>
                    ${escapeHTML(
                        asset.name || ""
                    )}
                </span>
            </div>

            <div>
                <strong>
                    ${formatMoney(
                        asset.price
                    )}
                </strong>

                <span
                    class="${
                        positive
                            ? "positive"
                            : "negative"
                    }"
                >
                    ${positive ? "+" : ""}
                    ${change.toFixed(2)}%
                </span>
            </div>

        </div>
    `;
}


// ============================================================
// MARKET LIST
// ============================================================

function renderAssetList() {
    const list =
        document.getElementById(
            "market-list"
        );

    if (!list) {
        return;
    }

    const assets =
        getFilteredMarketAssets();

    if (!assets.length) {
        list.innerHTML =
            `<div class="empty-state">
                No assets found.
            </div>`;

        return;
    }

    list.innerHTML =
        assets
            .map(asset => {
                const change =
                    getChange(asset);

                return `
                    <div
                        class="market-row"
                        onclick="openAsset('${asset.id}')"
                    >

                        <div class="market-name">
                            <strong>
                                ${escapeHTML(
                                    asset.symbol || ""
                                )}
                            </strong>

                            <span>
                                ${escapeHTML(
                                    asset.name || ""
                                )}
                            </span>
                        </div>

                        <div>
                            ${formatMoney(
                                asset.price
                            )}
                        </div>

                        <div
                            class="${
                                change >= 0
                                    ? "positive"
                                    : "negative"
                            }"
                        >
                            ${change >= 0 ? "+" : ""}
                            ${change.toFixed(2)}%
                        </div>

                        <div>
                            ${formatCompactMoney(
                                asset.market_cap
                            )}
                        </div>

                        <div>
                            ${formatCompactMoney(
                                asset.volume
                            )}
                        </div>

                    </div>
                `;
            })
            .join("");
}


// ============================================================
// MARKET FILTERING
// ============================================================

function getFilteredMarketAssets() {
    const searchInput =
        document.getElementById(
            "market-search"
        );

    const search =
        searchInput?.value
            .trim()
            .toLowerCase() || "";

    return marketAssets.filter(
        asset => {
            const matchesCategory =
                selectedMarketCategory ===
                    "All" ||
                asset.category ===
                    selectedMarketCategory;

            const matchesSearch =
                !search ||
                String(
                    asset.name || ""
                )
                    .toLowerCase()
                    .includes(search) ||
                String(
                    asset.symbol || ""
                )
                    .toLowerCase()
                    .includes(search);

            return (
                matchesCategory &&
                matchesSearch
            );
        }
    );
}


function filterMarket() {
    renderMarket();
}


function setMarketCategory(
    category,
    button
) {
    selectedMarketCategory =
        category;

    document
        .querySelectorAll(
            ".category"
        )
        .forEach(
            categoryButton => {
                categoryButton.classList.remove(
                    "active"
                );
            }
        );

    if (button) {
        button.classList.add(
            "active"
        );
    }

    renderMarket();
}


// ============================================================
// ASSET DETAIL
// ============================================================

async function openAsset(
    assetId
) {
    const asset =
        marketAssets.find(
            item =>
                String(item.id) ===
                String(assetId)
        );

    if (!asset) {
        console.warn(
            "Asset not found:",
            assetId
        );

        return;
    }

    showPage(
        "asset-detail"
    );

    const nameElement =
        document.getElementById(
            "asset-name"
        );

    const symbolElement =
        document.getElementById(
            "asset-symbol"
        );

    const priceElement =
        document.getElementById(
            "asset-price"
        );

    const changeElement =
        document.getElementById(
            "asset-change"
        );

    const categoryElement =
        document.getElementById(
            "asset-category"
        );

    const statCategoryElement =
        document.getElementById(
            "asset-stat-category"
        );

    const capElement =
        document.getElementById(
            "asset-market-cap"
        );

    const volumeElement =
        document.getElementById(
            "asset-volume"
        );

    const descriptionElement =
        document.getElementById(
            "asset-description"
        );

    if (nameElement) {
        nameElement.textContent =
            asset.name ||
            "—";
    }

    if (symbolElement) {
        symbolElement.textContent =
            asset.symbol ||
            "—";
    }

    if (priceElement) {
        priceElement.textContent =
            formatMoney(
                asset.price
            );
    }

    const change =
        getChange(asset);

    if (changeElement) {
        changeElement.textContent =
            `${
                change >= 0
                    ? "+"
                    : ""
            }${change.toFixed(2)}%`;

        changeElement.className =
            change >= 0
                ? "positive"
                : "negative";
    }

    if (categoryElement) {
        categoryElement.textContent =
            asset.category ||
            "—";
    }

    if (statCategoryElement) {
        statCategoryElement.textContent =
            asset.category ||
            "—";
    }

    if (capElement) {
        capElement.textContent =
            formatCompactMoney(
                asset.market_cap
            );
    }

    if (volumeElement) {
        volumeElement.textContent =
            formatCompactMoney(
                asset.volume
            );
    }

    if (descriptionElement) {
        descriptionElement.textContent =
            asset.description ||
            "No description available.";
    }

    currentChartAssetId =
        asset.id;

    currentChartPeriod =
        "1D";

    updateChartPeriodButtons();

    await loadPriceHistory(
        asset.id
    );
}


// ============================================================
// PRICE HISTORY
// ============================================================

async function loadPriceHistory(
    assetId
) {
    const container =
        document.getElementById(
            "price-chart"
        );

    if (!container) {
        return;
    }

    if (
        typeof LightweightCharts ===
        "undefined"
    ) {
        container.innerHTML =
            `<div class="chart-placeholder">
                Chart library failed to load.
            </div>`;

        console.error(
            "LightweightCharts was not loaded."
        );

        return;
    }

    container.innerHTML =
        `<div class="chart-loading">
            Loading chart...
        </div>`;

    const {
        data,
        error
    } =
        await supabaseClient
            .from("PriceHistory")
            .select("*")
            .eq(
                "asset_id",
                assetId
            )
            .order(
                "recorded_at",
                {
                    ascending: true
                }
            );

    if (error) {
        console.error(
            "Price history error:",
            error
        );

        container.innerHTML =
            `<div class="chart-placeholder">
                Unable to load price history.
            </div>`;

        return;
    }

    const history =
        data || [];

    if (!history.length) {
        container.innerHTML =
            `<div class="chart-placeholder">
                No price history yet.
            </div>`;

        return;
    }

    renderInteractiveChart(
        history
    );
}


// ============================================================
// INTERACTIVE CANDLESTICK CHART
// ============================================================

function renderInteractiveChart(
    history
) {
    const container =
        document.getElementById(
            "price-chart"
        );

    if (!container) {
        return;
    }

    if (currentChart) {
        currentChart.remove();
        currentChart = null;
        currentChartSeries = null;
    }

    if (chartResizeObserver) {
        chartResizeObserver.disconnect();
        chartResizeObserver = null;
    }

    container.innerHTML = "";

    const candles =
        buildCandlestickData(
            history
        );

    if (!candles.length) {
        container.innerHTML =
            `<div class="chart-placeholder">
                Not enough data for a chart.
            </div>`;

        return;
    }

    currentChart =
        LightweightCharts.createChart(
            container,
            {
                autoSize: true,

                layout: {
                    background: {
                        type: "solid",
                        color: "#080808"
                    },
                    textColor: "#888888"
                },

                grid: {
                    vertLines: {
                        color: "#202020"
                    },
                    horzLines: {
                        color: "#202020"
                    }
                },

                rightPriceScale: {
                    borderColor: "#252525",

                    scaleMargins: {
                        top: 0.08,
                        bottom: 0.08
                    }
                },

                timeScale: {
                    borderColor: "#252525",
                    timeVisible: true,
                    secondsVisible: false,
                    rightOffset: 5,
                    barSpacing: 8,
                    minBarSpacing: 2
                },

                crosshair: {
                    mode:
                        LightweightCharts
                            .CrosshairMode
                            .Normal
                },

                handleScroll: {
                    mouseWheel: true,
                    pressedMouseMove: true,
                    horzTouchDrag: true,
                    vertTouchDrag: true
                },

                handleScale: {
                    mouseWheel: true,
                    pinch: true,
                    axisPressedMouseMove: true,
                    axisDoubleClickReset: true
                }
            }
        );

    currentChartSeries =
        currentChart.addSeries(
            LightweightCharts.CandlestickSeries,
            {
                upColor: "#16c784",
                downColor: "#ea3943",

                borderUpColor:
                    "#16c784",

                borderDownColor:
                    "#ea3943",

                wickUpColor:
                    "#16c784",

                wickDownColor:
                    "#ea3943",

                borderVisible: true
            }
        );

    currentChartSeries.setData(
        candles
    );

    currentChart
        .timeScale()
        .fitContent();

    if (
        typeof ResizeObserver !==
        "undefined"
    ) {
        chartResizeObserver =
            new ResizeObserver(
                entries => {
                    if (
                        !currentChart ||
                        !entries.length
                    ) {
                        return;
                    }

                    const rect =
                        entries[0]
                            .contentRect;

                    currentChart.resize(
                        rect.width,
                        Math.max(
                            rect.height,
                            320
                        )
                    );
                }
            );

        chartResizeObserver.observe(
            container
        );
    }

    container.addEventListener(
        "dblclick",
        () => {
            if (currentChart) {
                currentChart
                    .timeScale()
                    .fitContent();
            }
        }
    );
}


// ============================================================
// BUILD CANDLE DATA
// ============================================================

function buildCandlestickData(
    history
) {
    const sorted =
        [...history]
            .filter(
                point =>
                    point.recorded_at
            )
            .sort(
                (a, b) =>
                    new Date(
                        a.recorded_at
                    ) -
                    new Date(
                        b.recorded_at
                    )
            );

    const candles = [];

    let previousClose = null;

    for (
        const point of sorted
    ) {
        const timestamp =
            Math.floor(
                new Date(
                    point.recorded_at
                ).getTime() /
                    1000
            );

        if (
            !Number.isFinite(
                timestamp
            )
        ) {
            continue;
        }

        const close =
            Number(
                point.close_price ??
                point.price
            );

        if (
            !Number.isFinite(
                close
            )
        ) {
            continue;
        }

        let open =
            Number(
                point.open_price
            );

        let high =
            Number(
                point.high_price
            );

        let low =
            Number(
                point.low_price
            );

        if (
            !Number.isFinite(
                open
            )
        ) {
            open =
                previousClose !==
                null
                    ? previousClose
                    : close;
        }

        if (
            !Number.isFinite(
                high
            )
        ) {
            high =
                Math.max(
                    open,
                    close
                );
        }

        if (
            !Number.isFinite(
                low
            )
        ) {
            low =
                Math.min(
                    open,
                    close
                );
        }

        high =
            Math.max(
                high,
                open,
                close
            );

        low =
            Math.min(
                low,
                open,
                close
            );

        const candle = {
            time: timestamp,
            open,
            high,
            low,
            close
        };

        const last =
            candles[
                candles.length - 1
            ];

        if (
            last &&
            last.time ===
                timestamp
        ) {
            candles[
                candles.length - 1
            ] = candle;
        } else {
            candles.push(
                candle
            );
        }

        previousClose =
            close;
    }

    return filterCandlesByPeriod(
        candles
    );
}


// ============================================================
// CHART PERIODS
// ============================================================

function setChartPeriod(
    period,
    button
) {
    currentChartPeriod =
        period;

    document
        .querySelectorAll(
            ".period"
        )
        .forEach(
            periodButton => {
                periodButton.classList.remove(
                    "active"
                );
            }
        );

    if (button) {
        button.classList.add(
            "active"
        );
    }

    if (
        !currentChartAssetId
    ) {
        return;
    }

    loadPriceHistory(
        currentChartAssetId
    );
}


function updateChartPeriodButtons() {
    document
        .querySelectorAll(
            ".period"
        )
        .forEach(
            button => {
                button.classList.toggle(
                    "active",
                    button.textContent
                        .trim() ===
                        currentChartPeriod
                );
            }
        );
}


function filterCandlesByPeriod(
    candles
) {
    if (!candles.length) {
        return [];
    }

    if (
        currentChartPeriod ===
        "ALL"
    ) {
        return candles;
    }

    const daysMap = {
        "1D": 1,
        "1W": 7,
        "1M": 30,
        "3M": 90,
        "1Y": 365
    };

    const days =
        daysMap[
            currentChartPeriod
        ];

    if (!days) {
        return candles;
    }

    const newest =
        candles[
            candles.length - 1
        ].time;

    const cutoff =
        newest -
        days *
            24 *
            60 *
            60;

    const filtered =
        candles.filter(
            candle =>
                candle.time >=
                cutoff
        );

    if (
        filtered.length < 2 &&
        candles.length >= 2
    ) {
        return candles;
    }

    return filtered;
}


// ============================================================
// ADMIN PANEL
// ============================================================

async function loadAdminPanel() {
    if (
        !currentUser ||
        !isMKMOwner(currentUser)
    ) {
        showPage("dashboard");
        return;
    }

    showPage("admin");

    await loadAdminData();
}


async function loadAdminData() {
    if (
        !currentUser ||
        !isMKMOwner(currentUser)
    ) {
        return;
    }

    await loadAdminCompanies();

    const countElement =
        document.getElementById(
            "admin-asset-count"
        );

    const capElement =
        document.getElementById(
            "admin-market-cap"
        );

    const {
        data,
        error
    } =
        await supabaseClient
            .from("Assets")
            .select("*");

    if (error) {
        console.error(
            "Admin market error:",
            error
        );

        return;
    }

    const assets =
        data || [];

    if (countElement) {
        countElement.textContent =
            assets.length;
    }

    const totalCap =
        assets.reduce(
            (sum, asset) =>
                sum +
                (
                    Number(
                        asset.market_cap
                    ) || 0
                ),
            0
        );

    if (capElement) {
        capElement.textContent =
            formatCompactMoney(
                totalCap
            );
    }
}


// ============================================================
// ADMIN COMPANY LIST
// ============================================================

async function loadAdminCompanies() {
    const list =
        document.getElementById(
            "admin-company-list"
        );

    if (!list) {
        return;
    }

    const {
        data,
        error
    } =
        await supabaseClient
            .from("Assets")
            .select("*")
            .order(
                "name",
                {
                    ascending: true
                }
            );

    if (error) {
        console.error(
            "Admin Assets error:",
            error
        );

        list.innerHTML =
            `<div class="empty-state">
                Unable to load companies.
            </div>`;

        return;
    }

    if (!data?.length) {
        list.innerHTML =
            `<div class="empty-state">
                No companies yet.
            </div>`;

        return;
    }

    list.innerHTML =
        data
            .map(
                asset => `
                    <div class="admin-company-row">

                        <div>
                            <strong>
                                ${escapeHTML(
                                    asset.name ||
                                    ""
                                )}
                            </strong>

                            <span>
                                ${escapeHTML(
                                    asset.symbol ||
                                    ""
                                )}
                            </span>
                        </div>

                        <div>
                            ${formatMoney(
                                asset.price
                            )}
                        </div>

                        <div>
                            ${escapeHTML(
                                asset.category ||
                                ""
                            )}
                        </div>

                    </div>
                `
            )
            .join("");
}


// ============================================================
// ADD COMPANY
// ============================================================

async function addCompany() {
    if (
        !currentUser ||
        !isMKMOwner(currentUser)
    ) {
        alert(
            "You are not authorized to do this."
        );

        return;
    }

    const name =
        document
            .getElementById(
                "company-name"
            )
            ?.value.trim();

    const symbol =
        document
            .getElementById(
                "company-symbol"
            )
            ?.value
            .trim()
            .toUpperCase();

    const category =
        document.getElementById(
            "company-category"
        )?.value;

    const price =
        Number(
            document.getElementById(
                "company-price"
            )?.value
        );

    const shares =
        Number(
            document.getElementById(
                "company-shares"
            )?.value
        );

    const message =
        document.getElementById(
            "company-message"
        );

    if (message) {
        message.textContent = "";
    }

    if (
        !name ||
        !symbol ||
        !category ||
        !Number.isFinite(price) ||
        !Number.isFinite(shares)
    ) {
        if (message) {
            message.textContent =
                "Please fill in all required fields.";
        }

        return;
    }

    const marketCap =
        price * shares;

    const {
        error
    } =
        await supabaseClient
            .from("Assets")
            .insert({
                name,
                symbol,
                category,
                price,
                previous_price:
                    price,
                market_cap:
                    marketCap,
                volume: 0,
                description: ""
            });

    if (error) {
        console.error(
            "Add company error:",
            error
        );

        if (message) {
            message.textContent =
                error.message;
        }

        return;
    }

    if (message) {
        message.textContent =
            `${name} was added to the MKM market.`;
    }

    const companyForm =
        document.getElementById(
            "company-form"
        );

    if (companyForm) {
        companyForm.reset();
    }

    await loadAdminData();
}


// ============================================================
// HTML ESCAPING
// ============================================================

function escapeHTML(
    value
) {
    return String(
        value ?? ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


// ============================================================
// START APP
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {
        setupForms();
        checkSession();
    }
);