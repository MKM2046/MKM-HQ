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
