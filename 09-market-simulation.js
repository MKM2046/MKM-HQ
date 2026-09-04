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
