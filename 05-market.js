// MARKET
// ============================================================

function formatSignedPercent(value) {
    const num = Number(value);
    if (!isFinite(num)) return "—";

    const abs = Math.abs(num);
    let decimals = 2;
    if (abs > 0 && abs < 0.01) decimals = 4;
    else if (abs < 0.1)        decimals = 3;

    let str = num.toFixed(decimals);

    if (decimals > 2) {
        const parts = str.split(".");
        if (parts.length === 2) {
            parts[1] = parts[1].replace(/0+$/, "");
            str = parts[1].length ? parts.join(".") : parts[0];
        }
    }

    const sign = num > 0 ? "+" : "";
    return sign + str + "%";
}


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