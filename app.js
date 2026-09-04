// ============================================================
// MKM Exchange - APP.JS LOADER
// ============================================================

(function () {
    "use strict";

    const files = [
        "01-core.js",
        "02-auth-session-dashboard.js",
        "03-portfolio-transactions.js",
        "04-profile.js",
        "05-market.js",
        "06-asset-trading.js",
        "07-chart.js",
        "08-admin.js",
        "09-market-simulation.js",
        "10-news.js",
        "11-code-redemption-license.js",
        "12-my-companies.js",
        "13-social-people-profile-chat.js",
        "14-listeners-init.js"
    ];

    const head = document.head || document.documentElement;

    function loadNext(i) {
        if (i >= files.length) {
            console.log("[MKM] All modules loaded.");
            return;
        }
        const s = document.createElement("script");
        s.src = files[i];
        s.async = false;
        s.onerror = () => console.error("[MKM] FAILED to load:", files[i]);
        s.onload = () => loadNext(i + 1);
        head.appendChild(s);
    }

    loadNext(0);
})();