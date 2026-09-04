// CHART
// ============================================================

/* ------------------------------------------------------------
   CONFIG
   ------------------------------------------------------------ */

const CHART_REFRESH_MS = 30000;    // poll history every 30s
let chartRefreshTimer = null;
let isChartLoading = false;

/* Map period buttons to candle interval in seconds */
function normalizePeriod(period) {
    const map = {
        "1W": "7D",
        "1M": "30D",
        "3M": "90D"
    };
    return map[period] || period || "ALL";
}

function getCandleInterval(period) {
    const p = normalizePeriod(period);
    switch (p) {
        case "1D":  return 300;        // 5 minutes
        case "7D":  return 3600;       // 1 hour
        case "30D": return 14400;      // 4 hours
        case "90D": return 14400;      // 4 hours
        case "1Y":  return 14400;      // 4 hours
        case "ALL": return 86400;      // 1 day
        default:    return 86400;
    }
}

function getCandleTime(timestampSec) {
    const interval = getCandleInterval(currentChartPeriod);
    return Math.floor(timestampSec / interval) * interval;
}

function chartLog(...args) {
    const DEBUG = true;
    if (DEBUG) console.log("[Chart]", ...args);
}

function getPricePrecision(price) {
    const p = Number(price);
    if (!isFinite(p) || p <= 0) return { precision: 2, minMove: 0.01 };
    if (p >= 1)    return { precision: 2, minMove: 0.01 };
    if (p >= 0.1)  return { precision: 3, minMove: 0.001 };
    if (p >= 0.01) return { precision: 4, minMove: 0.0001 };
    if (p >= 0.001)return { precision: 5, minMove: 0.00001 };
    return { precision: 6, minMove: 0.000001 };
}

function formatMoney(value) {
    const num = Number(value);
    if (!isFinite(num)) return "$—";

    const abs = Math.abs(num);
    let decimals = 2;
    if (abs < 0.001)      decimals = 6;
    else if (abs < 0.01)  decimals = 5;
    else if (abs < 0.1)   decimals = 4;
    else if (abs < 1)     decimals = 3;

    let str = num.toFixed(decimals);

    if (decimals > 2) {
        const parts = str.split(".");
        if (parts.length === 2) {
            parts[1] = parts[1].replace(/0+$/, "");
            str = parts[1].length ? parts.join(".") : parts[0];
        }
    }

    return (num < 0 ? "-" : "") + "$" + str.replace(/^-/, "");
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

    if (fixedHigh < fixedLow) {
        const tmp = fixedHigh;
        fixedHigh = fixedLow;
        fixedLow = tmp;
    }

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
                timeVisible: false,
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

        const priceFmt = getPricePrecision(currentAsset?.price);

        candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
            upColor: "#22c55e",
            downColor: "#ef4444",
            borderUpColor: "#22c55e",
            borderDownColor: "#ef4444",
            wickUpColor: "#22c55e",
            wickDownColor: "#ef4444",
            priceFormat: {
                type: "price",
                precision: priceFmt.precision,
                minMove: priceFmt.minMove
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
                        // Same bucket — update current candle
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
                        // New bucket — new candle, previous close = new open
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

                } else if (price > 0) {
                    // No candles yet — seed first candle
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

    // Build candles from history using the active interval
    const historyCandles = buildCandles(history);

    // Preserve real-time candles that are newer or same-bucket as last history
    const realtimeCutoff = historyCandles.length > 0
        ? historyCandles[historyCandles.length - 1].time
        : 0;

    const preservedRealtime = chartCandles.filter(c => c.time >= realtimeCutoff);

    // Merge and deduplicate by time (realtime overwrites history for current bucket)
    const mergedMap = new Map();

    for (const c of historyCandles) {
        const sc = sanitizeCandle(c);
        if (sc) mergedMap.set(sc.time, sc);
    }

    for (const c of preservedRealtime) {
        const sc = sanitizeCandle(c);
        if (sc) mergedMap.set(sc.time, sc);
    }

    let merged = Array.from(mergedMap.values()).sort((a, b) => a.time - b.time);
    merged = merged.filter((c, i, arr) => i === 0 || c.time > arr[i - 1].time);

    const livePrice = Number(currentAsset.price || 0);
    const interval = getCandleInterval(currentChartPeriod);

    if (merged.length > 0 && livePrice > 0) {
        const last = merged[merged.length - 1];
        const nowSec = Math.floor(Date.now() / 1000);
        const bucketTime = getCandleTime(nowSec);
        const lastBucket = getCandleTime(last.time);

        if (bucketTime === lastBucket) {
            // Still in same bucket — update with live price
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
            // New bucket started since last history fetch
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
                const minSpan = span < 86400 * 7 ? 86400 * 7 : span * 1.2;

                chart.timeScale().setVisibleRange({
                    from: lastTime - minSpan,
                    to: lastTime + Math.max(interval * 2, 3600)
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
   BUILD CANDLES FROM PRICE HISTORY (uses active interval)
   ------------------------------------------------------------ */

function buildCandles(history) {
    const interval = getCandleInterval(currentChartPeriod);
    const rows = [...history].sort(
        (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
    );

    // Aggregate all price ticks into buckets based on the active interval
    const bucketMap = new Map();

    rows.forEach(row => {
        const timestamp = new Date(row.recorded_at).getTime();
        if (!Number.isFinite(timestamp)) return;

        const bucketTime = Math.floor(timestamp / 1000 / interval) * interval;

        const price = Number(row.price ?? row.close_price);
        if (!Number.isFinite(price) || price <= 0) return;

        if (!bucketMap.has(bucketTime)) {
            bucketMap.set(bucketTime, {
                time: bucketTime,
                open: price,
                high: price,
                low: price,
                close: price
            });
        } else {
            const bucket = bucketMap.get(bucketTime);
            bucket.high = Math.max(bucket.high, price);
            bucket.low = Math.min(bucket.low, price);
            bucket.close = price;
        }
    });

    const sortedBuckets = Array.from(bucketMap.values()).sort((a, b) => a.time - b.time);

    const candles = [];
    let previousTime = 0;

    sortedBuckets.forEach(bucket => {
        let time = bucket.time;
        if (time <= previousTime) {
            time = previousTime + interval;
        }

        const candle = sanitizeCandle({
            time,
            open: bucket.open,
            high: bucket.high,
            low: bucket.low,
            close: bucket.close
        });

        if (candle) {
            candles.push(candle);
            previousTime = candle.time;
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