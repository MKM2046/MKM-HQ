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
