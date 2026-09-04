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
