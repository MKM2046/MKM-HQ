// ============================================================
// MKM HQ — ADMIN PANEL
// ============================================================

async function loadAdminPanel() {
    if (!currentUser || currentUser.id !== MKM_OWNER_ID) {
        alert("Admin access denied.");
        return;
    }
    await loadAdminAssets();
    await loadMarketSettings();
    await loadAdminCodes();
    await loadAdminRequests();
    showPage("admin");
}

/* Category-aware company form */
function updateCompanyFormForCategory() {
    const select = document.getElementById("company-category");
    const group = document.getElementById("company-shares-group");
    const input = document.getElementById("company-shares");
    if (!select || !group || !input) return;

    const category = select.value;
    if (category === "stock") {
        group.style.display = "";
        input.required = true;
        group.querySelector("label").textContent = "Shares Outstanding";
    } else if (category === "crypto") {
        group.style.display = "";
        input.required = true;
        group.querySelector("label").textContent = "Circulating Supply";
    } else {
        group.style.display = "none";
        input.required = false;
        input.value = "1";
    }
}

/* Attach company form handler — called by init.js AFTER DOM is ready */
function attachCompanyFormHandler() {
    const companyForm = document.getElementById("company-form");
    if (!companyForm) {
        console.warn("[Admin] company-form not found in DOM");
        return;
    }

    /* Prevent double-binding */
    if (companyForm.dataset.mkmBound === "1") return;
    companyForm.dataset.mkmBound = "1";

    companyForm.addEventListener("submit", async event => {
        event.preventDefault();

        if (!currentUser || currentUser.id !== MKM_OWNER_ID) {
            alert("Admin access denied.");
            return;
        }

        const name = document.getElementById("company-name")?.value.trim();
        const symbol = document.getElementById("company-symbol")?.value.trim().toUpperCase();
        const category = document.getElementById("company-category")?.value;
        const price = Number(document.getElementById("company-price")?.value);
        const sharesGroup = document.getElementById("company-shares-group");
        const shares = (sharesGroup && sharesGroup.style.display === "none")
            ? 1
            : Number(document.getElementById("company-shares")?.value);
        const message = document.getElementById("company-message");

        if (!name || !symbol || !category || !Number.isFinite(price) || price <= 0 || !Number.isInteger(shares) || shares <= 0) {
            if (message) {
                message.textContent = "Please enter valid company information.";
                message.style.color = "#ef4444";
            }
            return;
        }

        if (message) {
            message.textContent = "Adding company...";
            message.style.color = "";
        }

        try {
            const now = new Date().toISOString();
            const { data, error } = await supabaseClient
                .from("Assets")
                .insert({
                    name,
                    symbol,
                    category,
                    price,
                    previous_price: price,
                    day_open_price: price,
                    last_day_reset: now,
                    market_cap: price * shares,
                    volume: 0,
                    description: ""
                })
                .select()
                .single();

            if (error) throw error;

            await recordPriceHistory(data.id, price, price);

            if (message) {
                message.textContent = "Company added successfully.";
                message.style.color = "#22c55e";
            }

            companyForm.reset();
            updateCompanyFormForCategory();
            await loadAdminAssets();

        } catch (error) {
            console.error("[Admin] Add company error:", error);
            if (message) {
                message.textContent = error.message || "Could not add company.";
                message.style.color = "#ef4444";
            }
        }
    });
}

async function loadAdminAssets() {
    const { data: assets, error } = await supabaseClient
        .from("Assets")
        .select("*")
        .order("name");

    if (error) { console.error(error); return; }

    const list = document.getElementById("admin-company-list");
    const eventAsset = document.getElementById("event-asset");
    if (list) list.innerHTML = "";
    if (eventAsset) eventAsset.innerHTML = "";

    let totalMarketCap = 0;
    (assets || []).forEach(asset => {
        totalMarketCap += Number(asset.market_cap || 0);

        if (list) {
            const row = document.createElement("div");
            row.className = "admin-company-row";
            row.innerHTML = `
                <div><strong>${escapeHTML(asset.name)}</strong><span>${escapeHTML(asset.symbol)}</span></div>
                <div>${formatMoney(asset.price)}</div>
                <div>${formatMoney(asset.market_cap || 0)}</div>
            `;
            list.appendChild(row);
        }

        if (eventAsset) {
            const option = document.createElement("option");
            option.value = asset.id;
            option.textContent = `${asset.symbol} — ${asset.name}`;
            eventAsset.appendChild(option);
        }
    });

    setText("admin-asset-count", assets?.length || 0);
    setText("admin-market-cap", formatMoney(totalMarketCap));
}

/* Market Settings */
async function loadMarketSettings() {
    const { data: settings, error } = await supabaseClient
        .from("MarketSettings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

    if (error) { console.error(error); return; }
    if (!settings) return;

    const enabled = document.getElementById("automatic-market-enabled");
    const interval = document.getElementById("market-interval");
    const movement = document.getElementById("market-max-movement");

    if (enabled) enabled.checked = settings.automatic_enabled;
    if (interval) interval.value = settings.movement_interval_minutes;
    if (movement) movement.value = settings.max_normal_movement_percent;
}

async function saveMarketSettings() {
    if (!currentUser || currentUser.id !== MKM_OWNER_ID) return;

    const enabled = document.getElementById("automatic-market-enabled")?.checked;
    const interval = Number(document.getElementById("market-interval")?.value);
    const movement = Number(document.getElementById("market-max-movement")?.value);
    const message = document.getElementById("market-settings-message");

    if (!Number.isInteger(interval) || interval <= 0 || !Number.isFinite(movement) || movement <= 0) {
        if (message) { message.textContent = "Enter valid market settings."; message.style.color = "#ef4444"; }
        return;
    }

    const { error } = await supabaseClient
        .from("MarketSettings")
        .upsert({
            id: 1,
            automatic_enabled: Boolean(enabled),
            movement_interval_minutes: interval,
            max_normal_movement_percent: movement,
            updated_at: new Date().toISOString()
        });

    if (error) {
        console.error(error);
        if (message) { message.textContent = error.message; message.style.color = "#ef4444"; }
        return;
    }

    if (message) { message.textContent = "Market settings saved."; message.style.color = "#22c55e"; }
    await startMarketTimer();
}

/* Market Events */
async function createMarketEvent() {
    if (!currentUser || currentUser.id !== MKM_OWNER_ID) return;

    const assetId = document.getElementById("event-asset")?.value;
    const direction = document.getElementById("event-direction")?.value;
    const strength = document.getElementById("event-strength")?.value;
    const duration = Number(document.getElementById("event-duration")?.value);
    const message = document.getElementById("market-event-message");

    if (!assetId || !direction || !strength || !Number.isInteger(duration) || duration <= 0) {
        if (message) { message.textContent = "Enter valid event information."; message.style.color = "#ef4444"; }
        return;
    }

    const expiresAt = new Date(Date.now() + duration * 60 * 1000).toISOString();
    const { error } = await supabaseClient
        .from("MarketEvents")
        .insert({ asset_id: assetId, direction, strength, duration_minutes: duration, expires_at: expiresAt });

    if (error) {
        console.error(error);
        if (message) { message.textContent = error.message; message.style.color = "#ef4444"; }
        return;
    }

    if (message) { message.textContent = "Market event created."; message.style.color = "#22c55e"; }
}

/* Admin Codes */
async function loadAdminCodes() {
    if (!currentUser || currentUser.id !== MKM_OWNER_ID) return;

    const { data: codes, error } = await supabaseClient
        .from("RedemptionCodes")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) { console.error(error); return; }

    const container = document.getElementById("admin-codes-list");
    if (!container) return;

    if (!codes || !codes.length) {
        container.innerHTML = '<p style="color:#94a3b8;">No codes created yet.</p>';
        return;
    }

    container.innerHTML = "";
    codes.forEach(code => {
        const row = document.createElement("div");
        row.className = "code-row";
        const expired = code.expires_at && new Date(code.expires_at) < new Date();
        const status = !code.active ? "Inactive" : expired ? "Expired" : code.uses_count >= code.max_uses ? "Used Up" : "Active";
        const statusColor = status === "Active" ? "#22c55e" : "#ef4444";

        row.innerHTML = `
            <div><strong>${escapeHTML(code.code)}</strong><span>${formatMoney(code.reward_amount)} · ${code.uses_count}/${code.max_uses} uses</span></div>
            <div style="color:${statusColor};font-weight:700;">${status}</div>
            <div>${code.expires_at ? formatDateTime(code.expires_at) : "No expiry"}</div>
        `;
        container.appendChild(row);
    });
}

async function createRedemptionCode(event) {
    event.preventDefault();
    if (!currentUser || currentUser.id !== MKM_OWNER_ID) return;

    const message = document.getElementById("code-message");
    const codeVal = document.getElementById("code-value")?.value.trim().toUpperCase();
    const reward = Number(document.getElementById("code-reward")?.value);
    const maxUses = Number(document.getElementById("code-uses")?.value);
    const expiryVal = document.getElementById("code-expiry")?.value;

    if (!codeVal || !Number.isFinite(reward) || reward <= 0 || !Number.isInteger(maxUses) || maxUses <= 0) {
        if (message) { message.textContent = "Enter valid code details."; message.style.color = "#ef4444"; }
        return;
    }

    let expiresAt = null;
    if (expiryVal) expiresAt = new Date(expiryVal).toISOString();

    try {
        const { data, error } = await supabaseClient.rpc("create_redemption_code", {
            p_code: codeVal,
            p_reward: reward,
            p_max_uses: maxUses,
            p_expires_at: expiresAt
        });
        if (error) throw error;

        if (data.success) {
            if (message) { message.textContent = data.message; message.style.color = "#22c55e"; }
            document.getElementById("redeem-code-form")?.reset();
            await loadAdminCodes();
        } else {
            if (message) { message.textContent = data.message; message.style.color = "#ef4444"; }
        }
    } catch (err) {
        console.error("Code creation error:", err);
        if (message) { message.textContent = err.message || "Could not create code."; message.style.color = "#ef4444"; }
    }
}

/* Admin Requests */
async function loadAdminRequests() {
    if (!currentUser || currentUser.id !== MKM_OWNER_ID) return;

    const { data: requests, error } = await supabaseClient
        .from("CompanyRequests")
        .select("id, user_id, name, symbol, category, requested_shares, status, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

    if (error) { console.error(error); return; }

    const container = document.getElementById("admin-requests-list");
    if (!container) return;

    if (!requests || !requests.length) {
        container.innerHTML = '<p style="color:#94a3b8;">No pending requests.</p>';
        return;
    }

    container.innerHTML = "";
    requests.forEach(req => {
        const row = document.createElement("div");
        row.className = "request-row";
        row.innerHTML = `
            <div>
                <strong>${escapeHTML(req.name)} (${escapeHTML(req.symbol)})</strong>
                <span>${formatCategory(req.category)} · ${formatNumber(req.requested_shares)} shares · by ${escapeHTML(req.user_id?.substring(0,8) || "user")}</span>
            </div>
            <div class="request-actions">
                <input type="number" id="req-price-${req.id}" placeholder="Price €" min="0.01" step="0.01" style="width:100px;">
                <input type="number" id="req-shares-${req.id}" placeholder="Shares" min="1" step="1" style="width:100px;" value="${req.requested_shares}">
                <button onclick="approveCompanyRequest('${req.id}')">Approve</button>
                <button class="secondary" onclick="rejectCompanyRequest('${req.id}')">Reject</button>
            </div>
        `;
        container.appendChild(row);
    });
}

async function approveCompanyRequest(requestId) {
    if (!currentUser || currentUser.id !== MKM_OWNER_ID) return;

    const priceInput = document.getElementById(`req-price-${requestId}`);
    const sharesInput = document.getElementById(`req-shares-${requestId}`);
    const price = Number(priceInput?.value);
    const shares = Number(sharesInput?.value);

    if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(shares) || shares <= 0) {
        alert("Enter valid price and shares.");
        return;
    }

    try {
        const { data, error } = await supabaseClient.rpc("approve_company_request", {
            p_request_id: requestId,
            p_starting_price: price,
            p_approved_shares: shares
        });
        if (error) throw error;

        if (data.success) {
            alert(data.message);

            const { data: req } = await supabaseClient
                .from("CompanyRequests")
                .select("symbol")
                .eq("id", requestId)
                .maybeSingle();

            if (req?.symbol) {
                const { data: asset } = await supabaseClient
                    .from("Assets")
                    .select("id, price")
                    .eq("symbol", req.symbol)
                    .eq("price", price)
                    .maybeSingle();

                if (asset) {
                    await supabaseClient
                        .from("Assets")
                        .update({ day_open_price: price, last_day_reset: new Date().toISOString() })
                        .eq("id", asset.id);
                    await recordPriceHistory(asset.id, asset.price, asset.price);
                }
            }

            await loadAdminRequests();
            await loadAdminAssets();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert(err.message || "Approval failed.");
    }
}

async function rejectCompanyRequest(requestId) {
    if (!currentUser || currentUser.id !== MKM_OWNER_ID) return;

    const reason = prompt("Reason for rejection (optional):");
    if (reason === null) return;

    try {
        const { data, error } = await supabaseClient.rpc("reject_company_request", {
            p_request_id: requestId,
            p_reason: reason || ""
        });
        if (error) throw error;

        if (data.success) await loadAdminRequests();
        else alert(data.message);
    } catch (err) {
        console.error(err);
        alert(err.message || "Rejection failed.");
    }
}