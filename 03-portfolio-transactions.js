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
