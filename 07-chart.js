// CHART
// ============================================================

/* ------------------------------------------------------------
   CONFIG
   ------------------------------------------------------------ */

const CANDLE_INTERVAL = 60;        // seconds per real-time candle
const CHART_REFRESH_MS = 30000;    // poll history every 30s
let chartRefreshTimer = null;
let isChartLoading = false;

function getCandleTime(timestampSec) {
    return Math.floor(timestampSec / CANDLE_INTERVAL) * CANDLE_INTERVAL;
}

function chartLog(...args) {
    const DEBUG = true; // flip to false once it's working
    if (DEBUG) console.log("[Chart]", ...args);
}

/* Validate & fix a candle before passing to Lightweight Charts */
function sanitizeCandle(c) {
    if (!c) return null;

    const time = Number(c.time);
    const open = Number(c.open);
    const high = Number(c.high);
    const low  = Number(c.low);
    const close = Number(c.close);

    if (!Number.isFinite(time) || time <= 0) return null;
    if (!Number.isFinite(open)  || open  < 0) return null;
    if (!Number.isFinite(close) || close < 0) return null;

    let fixedHigh = Number.isFinite(high) ? high : Math.max(open, close);
    let fixedLow  = Number.isFinite(low)  ? low  : Math.min(open, close);

    // Ensure high >= low
    if (fixedHigh < fixedLow) {
        const tmp = fixedHigh;
        fixedHigh = fixedLow;
        fixedLow = tmp;
    }

    // Ensure wicks extend past body
    fixedHigh = Math.max(fixedHigh, open, close);
    fixedLow  = Math.min(fixedLow,  open, close);

    return { time, open, high: fixedHigh, low: fixedLow, close };
}

/* ------------------------------------------------------------
   LOAD CHART
   ------------------------------------------------------------ */

async function loadChart() {
    const container = document.getElementById("price-chart");
    if (!container || !currentAsset) {
        chartLog("No container or currentAsset");
        return;
    }

    // Tear down old chart
    stopChartRefresh();
    if (chartResizeObserver) {
        try { chartResizeObserver.disconnect(); } catch (e) {}
        chartResizeObserver = null;
    }
    if (chart) {
        try { chart.remove(); } catch (e) { chartLog("Remove error:", e); }
        chart = null;
        candleSeries = null;
    }

    container.innerHTML = "";
    chartCandles = [];
    isChartLoading = true;

    if (typeof LightweightCharts === "undefined") {
        container.innerHTML = "<p>Chart library unavailable.</p>";
        isChartLoading = false;
        return;
    }

    const containerHeight = container.clientHeight || 420;

    try {
        chart = LightweightCharts.createChart(container, {
            width: container.clientWidth || 700,
            height: containerHeight,
            layout: {
                background: { color: "transparent" },
                textColor: "#9ca3af"
            },
            grid: {
                vertLines: { color: "rgba(128,128,128,0.12)" },
                horzLines: { color: "rgba(128,128,128,0.12)" }
            },
            localization: {
                locale: navigator.language || "en-GB"
            },
            rightPriceScale: {
                borderColor: "rgba(128,128,128,0.25)"
            },
            timeScale: {
                borderColor: "rgba(128,128,128,0.25)",
                timeVisible: true,
                secondsVisible: false,
                rightOffset: 6,
                barSpacing: 10
            },
            crosshair: { mode: 1 },
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
        });

        candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
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
        });
    } catch (err) {
        console.error("Chart init error:", err);
        container.innerHTML = "<p>Could not initialise chart.</p>";
        isChartLoading = false;
        return;
    }

    await loadChartData();

    if (typeof ResizeObserver !== "undefined") {
        chartResizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                if (!chart) return;
                try {
                    chart.resize(entry.contentRect.width, entry.contentRect.height);
                } catch (e) {}
            }
        });
        chartResizeObserver.observe(container);
    }

    subscribeToAssetPrice();
    startChartRefresh();
    isChartLoading = false;
}

/* ------------------------------------------------------------
   REAL-TIME PRICE SUBSCRIPTION
   ------------------------------------------------------------ */

function subscribeToAssetPrice() {
    if (priceSubscription) {
        try { supabaseClient.removeChannel(priceSubscription); } catch (e) {}
        priceSubscription = null;
    }

    if (!currentAsset) return;

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
                if (!payload.new) return;

                currentAsset = payload.new;

                const priceText = formatMoney(currentAsset.price);
                setText("asset-price", priceText);
                setText("trade-price", priceText);
                updateAssetChange(currentAsset);
                updateTradePreview();

                if (!chart || !candleSeries) return;

                const rawPrice = currentAsset.price;
                const price = Number(rawPrice);

                if (!Number.isFinite(price) || price < 0) {
                    chartLog("Invalid price in subscription:", rawPrice);
                    return;
                }

                const nowSec = Math.floor(Date.now() / 1000);
                const bucketTime = getCandleTime(nowSec);

                if (chartCandles.length > 0) {
                    const last = chartCandles[chartCandles.length - 1];
                    const lastBucket = getCandleTime(last.time);

                    if (bucketTime === lastBucket) {
                        // Same bucket — update existing candle
                        const updated = sanitizeCandle({
                            time: last.time,
                            open: last.open,
                            high: Math.max(last.high, price),
                            low: Math.min(last.low, price),
                            close: price
                        });

                        if (!updated) {
                            chartLog("Sanitize failed for update");
                            return;
                        }

                        chartCandles[chartCandles.length - 1] = updated;

                        try {
                            candleSeries.update(updated);
                        } catch (err) {
                            chartLog("Update failed:", err, updated);
                        }

                    } else if (bucketTime > lastBucket) {
                        // New bucket — create a fresh candle
                        const newCandle = sanitizeCandle({
                            time: bucketTime,
                            open: last.close,
                            high: Math.max(last.close, price),
                            low: Math.min(last.close, price),
                            close: price
                        });

                        if (!newCandle) {
                            chartLog("Sanitize failed for new candle");
                            return;
                        }

                        chartCandles.push(newCandle);

                        try {
                            candleSeries.update(newCandle);
                        } catch (err) {
                            chartLog("New candle update failed:", err, newCandle);
                        }

                        try {
                            chart.timeScale().fitContent();
                        } catch (e) {}
                    }
                    // bucketTime < lastBucket → clock went backwards, ignore

                } else if (price > 0) {
                    // No candles yet — seed first live candle
                    const first = sanitizeCandle({
                        time: bucketTime,
                        open: price,
                        high: price,
                        low: price,
                        close: price
                    });

                    if (!first) {
                        chartLog("Sanitize failed for first candle");
                        return;
                    }

                    chartCandles = [first];

                    try {
                        candleSeries.setData(chartCandles);
                    } catch (err) {
                        chartLog("setData failed:", err, first);
                    }

                    hideChartMessage();
                }
            }
        )
        .subscribe((status) => {
            chartLog("Price subscription status:", status);
        });
}

/* ------------------------------------------------------------
   CHART DATA
   ------------------------------------------------------------ */

async function loadChartData() {
    if (!currentAsset || !candleSeries) return;

    const periodStart = getChartStartDate(currentChartPeriod);

    let history = [];
    let fetchError = null;

    try {
        let query = supabaseClient
            .from("PriceHistory")
            .select("*")
            .eq("asset_id", currentAsset.id)
            .order("recorded_at", { ascending: true });

        if (currentChartPeriod !== "ALL") {
            query = query.gte("recorded_at", periodStart.toISOString());
        }

        const { data, error } = await query;

        if (error) {
            fetchError = error;
            chartLog("History fetch error:", error);
        } else {
            history = data || [];
        }
    } catch (err) {
        fetchError = err;
        chartLog("History fetch exception:", err);
    }

    // Build candles from history
    const historyCandles = buildCandles(history);

    // Preserve real-time candles that are newer than the last history row
    const realtimeCutoff = historyCandles.length > 0
        ? historyCandles[historyCandles.length - 1].time
        : 0;

    const preservedRealtime = chartCandles.filter(c => c.time > realtimeCutoff);

    // Merge and deduplicate by time
    const mergedMap = new Map();

    for (const c of historyCandles) {
        const sc = sanitizeCandle(c);
        if (sc) mergedMap.set(sc.time, sc);
    }

    for (const c of preservedRealtime) {
        const sc = sanitizeCandle(c);
        if (sc) mergedMap.set(sc.time, sc);
    }

    // Sort by time and enforce strictly increasing
    let merged = Array.from(mergedMap.values()).sort((a, b) => a.time - b.time);
    merged = merged.filter((c, i, arr) => i === 0 || c.time > arr[i - 1].time);

    const livePrice = Number(currentAsset.price || 0);

    if (merged.length > 0 && livePrice > 0) {
        const last = merged[merged.length - 1];
        const nowSec = Math.floor(Date.now() / 1000);
        const bucketTime = getCandleTime(nowSec);
        const lastBucket = getCandleTime(last.time);

        if (bucketTime === lastBucket) {
            const updated = sanitizeCandle({
                time: last.time,
                open: last.open,
                high: Math.max(last.high, livePrice),
                low: Math.min(last.low, livePrice),
                close: livePrice
            });

            if (updated) {
                merged[merged.length - 1] = updated;
            }
        } else if (bucketTime > lastBucket) {
            const newCandle = sanitizeCandle({
                time: bucketTime,
                open: last.close,
                high: Math.max(last.close, livePrice),
                low: Math.min(last.close, livePrice),
                close: livePrice
            });

            if (newCandle) {
                merged.push(newCandle);
            }
        }

    } else if (merged.length === 0 && livePrice > 0) {
        const nowSec = Math.floor(Date.now() / 1000);
        const seed = sanitizeCandle({
            time: getCandleTime(nowSec),
            open: livePrice,
            high: livePrice,
            low: livePrice,
            close: livePrice
        });

        if (seed) {
            merged.push(seed);
        }
    }

    if (!merged.length) {
        chartLog("No candles to display");
        try { candleSeries.setData([]); } catch (e) {}

        if (fetchError) {
            showChartMessage("Price history unavailable. Chart will update live.");
        } else {
            showChartMessage("Not enough real market history yet.");
        }

        chartCandles = [];
        return;
    }

    hideChartMessage();

    chartCandles = merged;

    try {
        candleSeries.setData(merged);
    } catch (err) {
        chartLog("setData failed in loadChartData:", err);
        showChartMessage("Chart error. Check console.");
        return;
    }

    if (chart) {
        try {
            if (merged.length < 6) {
                const lastTime = merged[merged.length - 1].time;
                const firstTime = merged[0].time;
                const span = lastTime - firstTime;
                const minSpan = span < 3600 ? 3600 : span * 1.5;

                chart.timeScale().setVisibleRange({
                    from: lastTime - minSpan,
                    to: lastTime + minSpan * 0.15
                });
            } else {
                chart.timeScale().fitContent();
            }
        } catch (e) {
            chartLog("Fit content error:", e);
        }
    }
}

/* ------------------------------------------------------------
   REAL CANDLES
   ------------------------------------------------------------ */

function buildCandles(history) {
    const rows = [...history].sort(
        (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
    );

    const candles = [];
    let previousTime = 0;
    let previousClose = null;

    rows.forEach(row => {
        const timestamp = new Date(row.recorded_at).getTime();
        if (!Number.isFinite(timestamp)) return;

        let time = Math.floor(timestamp / 1000);

        // Lightweight Charts requires strictly increasing timestamps
        if (time <= previousTime) {
            time = previousTime + 1;
        }

        const close = Number(row.close_price ?? row.price);
        if (!Number.isFinite(close) || close <= 0) return;

        let open = Number(row.open_price);
        let high = Number(row.high_price);
        let low  = Number(row.low_price);

        const hasValidOHLC =
            Number.isFinite(open) &&
            Number.isFinite(high) &&
            Number.isFinite(low) &&
            open > 0 &&
            high >= Math.max(open, close) &&
            low <= Math.min(open, close) &&
            high >= low;

        if (!hasValidOHLC) {
            open = previousClose !== null ? previousClose : close;

            const move = Math.abs(close - open);
            const baseWick = move > 0
                ? move * (0.1 + Math.random() * 0.3)
                : close * 0.002;

            const wick = Math.max(baseWick, close * 0.0005);

            high = Math.max(open, close) + wick;
            low  = Math.min(open, close) - wick;
        }

        const candle = sanitizeCandle({ time, open, high, low, close });
        if (candle) {
            candles.push(candle);
            previousTime = candle.time;
            previousClose = candle.close;
        }
    });

    return candles;
}

/* ------------------------------------------------------------
   CHART PERIOD CONTROLS
   ------------------------------------------------------------ */

function setChartPeriod(period) {
    currentChartPeriod = period;

    document.querySelectorAll(".chart-periods button").forEach(button => {
        const active = button.dataset.period === period;
        button.classList.toggle("active", active);
    });

    loadChartData();
}

function getChartStartDate(period) {
    const now = new Date();
    const start = new Date(now);

    const map = {
        "1W": "7D",
        "1M": "30D",
        "3M": "90D"
    };

    const p = map[period] || period;

    switch (p) {
        case "1D":
            start.setDate(now.getDate() - 1);
            break;
        case "7D":
            start.setDate(now.getDate() - 7);
            break;
        case "30D":
            start.setDate(now.getDate() - 30);
            break;
        case "90D":
            start.setDate(now.getDate() - 90);
            break;
        case "1Y":
            start.setFullYear(now.getFullYear() - 1);
            break;
        case "ALL":
        default:
            start.setFullYear(now.getFullYear() - 10);
            break;
    }

    return start;
}

/* ------------------------------------------------------------
   CHART MESSAGE OVERLAY
   ------------------------------------------------------------ */

function showChartMessage(message) {
    const chartContainer = document.getElementById("price-chart");
    if (!chartContainer) return;

    let messageElement = document.getElementById("mkm-chart-message");

    if (!messageElement) {
        messageElement = document.createElement("div");
        messageElement.id = "mkm-chart-message";
        messageElement.className = "chart-message-overlay";
        chartContainer.appendChild(messageElement);
    }

    messageElement.textContent = message;
}

function hideChartMessage() {
    const messageElement = document.getElementById("mkm-chart-message");
    if (messageElement) {
        messageElement.remove();
    }
}

/* ------------------------------------------------------------
   REFRESH TIMER HELPERS
   ------------------------------------------------------------ */

function startChartRefresh() {
    stopChartRefresh();
    chartRefreshTimer = setInterval(() => {
        if (currentAsset && chart && candleSeries && !isChartLoading) {
            chartLog("Periodic history refresh");
            loadChartData();
        }
    }, CHART_REFRESH_MS);
}

function stopChartRefresh() {
    if (chartRefreshTimer) {
        clearInterval(chartRefreshTimer);
        chartRefreshTimer = null;
    }
}

// ============================================================