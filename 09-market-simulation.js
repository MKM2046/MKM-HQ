// ============================================================
// BROWSER MARKET SIMULATION — FULL VERSION
// ============================================================

let marketTimer = null;
let currentAsset = null;

// ------------------------------------------------------------
// CATEGORY BEHAVIOUR CONFIG
// ------------------------------------------------------------

const CATEGORY_BEHAVIOUR = {
    forex: {
        volatility: 0.05,      // was 0.3
        drift: 0.008,          // was 0.05
        liquidityBase: 100000,
        gapChance: 0.02
    },
    stock: {
        volatility: 0.12,      // was 1.0
        drift: 0.02,           // was 0.15
        liquidityBase: 50000,
        gapChance: 0.05
    },
    crypto: {
        volatility: 0.35,      // was 2.5
        drift: 0.06,           // was 0.4
        liquidityBase: 5000,
        gapChance: 0.12
    },
    commodity: {
        volatility: 0.04,      // was 0.8
        drift: 0.008,          // was 0.1
        liquidityBase: 20000,
        gapChance: 0.04
    }
};

function getCategoryBehaviour(category) {
    return CATEGORY_BEHAVIOUR[category] || CATEGORY_BEHAVIOUR.stock;
}

// ------------------------------------------------------------
// PRICE & CHANGE FORMATTING
// ------------------------------------------------------------

function formatPrice(price) {
    const num = Number(price);
    if (!isFinite(num) || num < 0) return "$—";

    if (num >= 1000)   return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (num >= 1)      return `$${num.toFixed(2)}`;
    if (num >= 0.1)    return `$${num.toFixed(3)}`;
    if (num >= 0.01)   return `$${num.toFixed(4)}`;
    if (num >= 0.001)  return `$${num.toFixed(5)}`;
    if (num >= 0.0001) return `$${num.toFixed(6)}`;
    return `$${num.toFixed(8)}`;
}

function formatPriceChange(current, previous) {
    const cur = Number(current);
    const prev = Number(previous);

    if (!isFinite(cur) || !isFinite(prev) || prev <= 0) {
        return { text: "—", className: "neutral", raw: 0, arrow: "" };
    }

    const rawChange = ((cur - prev) / prev) * 100;
    const absChange = Math.abs(rawChange);

    let decimals = 2;
    if (absChange === 0) {
        decimals = 2;
    } else if (absChange < 0.001) {
        decimals = 5;
    } else if (absChange < 0.01) {
        decimals = 4;
    } else if (absChange < 0.1) {
        decimals = 3;
    }

    const sign = rawChange > 0 ? "+" : "";
    const arrow = rawChange > 0 ? "▲" : rawChange < 0 ? "▼" : "—";
    const text = `${sign}${rawChange.toFixed(decimals)}%`;

    return {
        text,
        className: rawChange > 0 ? "up" : rawChange < 0 ? "down" : "neutral",
        raw: rawChange,
        arrow
    };
}

// ------------------------------------------------------------
// SIMULATION CORE
// ------------------------------------------------------------

async function runMarketSimulation() {
    try {
        const { data: settings } = await supabaseClient
            .from("MarketSettings")
            .select("*")
            .eq("id", 1)
            .maybeSingle();

        if (!settings || !settings.automatic_enabled) {
            return;
        }

        const { data: assets, error } = await supabaseClient
            .from("Assets")
            .select("*");

        if (error) throw error;

        for (const asset of assets || []) {
            await simulateAssetMovement(asset, settings);
        }

        const marketEl = document.getElementById("market");
        if (marketEl && !marketEl.classList.contains("hidden")) {
            await loadMarket();
        }

        if (currentAsset) {
            await refreshCurrentAsset();
        }

    } catch (error) {
        console.error("Market simulation error:", error);
    }
}

async function simulateAssetMovement(asset, settings) {
    const current = Number(asset.price || 0);
    if (current <= 0) return;

    const lastReset = asset.last_day_reset ? new Date(asset.last_day_reset) : null;
    const now = new Date();
    const isNewDay = !lastReset ||
        lastReset.getFullYear() !== now.getFullYear() ||
        lastReset.getMonth() !== now.getMonth() ||
        lastReset.getDate() !== now.getDate();

    if (isNewDay) {
        await supabaseClient
            .from("Assets")
            .update({
                day_open_price: current,
                last_day_reset: now.toISOString()
            })
            .eq("id", asset.id);
    }

    const behaviour = getCategoryBehaviour(asset.category);

    const maxMovement =
        Number(settings.max_normal_movement_percent || 1) *
        behaviour.volatility;

    const volume = Number(asset.volume || 0);
    const liquidityFactor = Math.max(
        0.15,
        1 / (1 + Math.log10(volume + behaviour.liquidityBase) * 0.12)
    );

    const drift = (Math.random() - 0.48) * behaviour.drift;

    let movement = (Math.random() * 2 - 1) * maxMovement * liquidityFactor + drift;

    if (Math.random() < behaviour.gapChance) {
        movement *= (1.2 + Math.random() * 1.5);
    }

    const { data: events } = await supabaseClient
        .from("MarketEvents")
        .select("*")
        .eq("asset_id", asset.id)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);

    const event = events?.[0];
    if (event) {
        const multiplier = {
            low: 1.5,
            medium: 2.5,
            high: 4
        }[event.strength] || 1;

        movement =
            Math.abs(movement) *
            multiplier *
            (event.direction === "up" ? 1 : -1);
    }

    const newPrice = Math.max(0.0001, current * (1 + movement / 100));

    const { error } = await supabaseClient
        .from("Assets")
        .update({
            previous_price: current,
            price: newPrice
        })
        .eq("id", asset.id);

    if (error) {
        console.error("Asset update failed:", error);
        return;
    }

    await recordPriceHistory(asset.id, newPrice, current);
}

// ------------------------------------------------------------
// PRICE HISTORY
// ------------------------------------------------------------

async function recordPriceHistory(assetId, newPrice, oldPrice) {
    try {
        await supabaseClient
            .from("PriceHistory")
            .insert({
                asset_id: assetId,
                price: newPrice,
                previous_price: oldPrice,
                recorded_at: new Date().toISOString()
            });
    } catch (err) {
        console.error("Price history record failed:", err);
    }
}

// ------------------------------------------------------------
// UI REFRESH HELPERS
// ------------------------------------------------------------

async function loadMarket() {
    // Wired to 05-market.js
}

async function refreshCurrentAsset() {
    // Wired to 06-asset-trading.js
}

// ------------------------------------------------------------
// TIMER
// ------------------------------------------------------------

async function startMarketTimer() {
    if (marketTimer) {
        clearInterval(marketTimer);
        marketTimer = null;
    }

    const { data: settings } = await supabaseClient
        .from("MarketSettings")
        .select("movement_interval_minutes")
        .eq("id", 1)
        .maybeSingle();

    const minutes = Number(settings?.movement_interval_minutes || 5);

    marketTimer = setInterval(runMarketSimulation, minutes * 60 * 1000);
}

function stopMarketTimer() {
    if (marketTimer) {
        clearInterval(marketTimer);
        marketTimer = null;
    }
}

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

if (typeof window !== "undefined") {
    window.MarketSimulation = {
        startMarketTimer,
        stopMarketTimer,
        runMarketSimulation,
        formatPrice,
        formatPriceChange
    };
}

// ============================================================