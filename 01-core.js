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