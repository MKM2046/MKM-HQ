// MY COMPANIES
// ============================================================

async function loadMyCompanies() {
    if (!currentUser) { await checkSession(); return; }

    const { data: profile } = await supabaseClient
        .from("Profiles")
        .select("company_license, license_tier, license_slots, license_purchased_at, balance")
        .eq("id", currentUser.id)
        .maybeSingle();

    renderLicenseStatus(profile);

    // Load my requests
    await loadMyRequests();

    // Load my companies with fee status
    const { data: companies, error } = await supabaseClient
        .from("Assets")
        .select("*")
        .eq("created_by_user_id", currentUser.id)
        .order("created_at", { ascending: false });

    if (error) console.error(error);
    renderMyCompaniesList(companies || [], profile);

    // Show slots info
    const slotsInfo = document.getElementById("slots-info");
    if (slotsInfo) {
        const totalSlots = profile?.license_slots || 0;
        const used = (companies || []).filter(c => !c.is_delisted).length;
        const pending = document.querySelectorAll("#my-requests-list .request-row").length;
        const remaining = Math.max(0, totalSlots - used - pending);
        slotsInfo.innerHTML = `Slots: <strong>${used + pending}/${totalSlots}</strong> used · <strong>${remaining}</strong> remaining`;
        slotsInfo.style.color = remaining > 0 ? "#22c55e" : "#ef4444";
    }

    showPage("my-companies");
}


function renderLicenseStatus(profile) {
    const text = document.getElementById("license-status-text");
    const btn = document.getElementById("buy-license-btn");
    const formCard = document.getElementById("establish-form-card");
    const tierInfo = document.getElementById("license-tier-info");

    if (!text) return;

    const tier = profile?.license_tier;
    const config = tier ? LICENSE_TIERS[tier] : null;
    const slots = profile?.license_slots || 0;

    if (config && slots > 0) {
        text.innerHTML = `<span style="color:#22c55e;font-weight:700;">${config.name} License</span> · ${slots} slot(s)`;
        if (tierInfo) {
            tierInfo.innerHTML = `
                <div class="tier-details">
                    <p>Slots: ${slots} total</p>
                    <p>Max shares per company: ${formatNumber(config.maxShares)}</p>
                    <p>Commission: ${config.commissionRate}% per trade</p>
                    <p>Establishment fee: ${formatMoney(config.establishmentFee)} per company</p>
                    <p>Weekly listing fee: ${formatMoney(config.weeklyFee)} per company</p>
                </div>
            `;
            tierInfo.classList.remove("hidden");
        }
        if (btn) {
            btn.classList.remove("hidden");
            btn.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:6px;margin-top:12px;">
                    <button onclick="buyLicenseTier('basic')">+ Basic Slot — ${formatMoney(2500)}</button>
                    <button onclick="buyLicenseTier('standard')">+ Standard Slot — ${formatMoney(10000)}</button>
                    <button onclick="buyLicenseTier('enterprise')">+ Enterprise Slot — ${formatMoney(50000)}</button>
                </div>
            `;
        }
        if (formCard) formCard.classList.remove("hidden");
    } else {
        text.innerHTML = `Status: <span style="color:#94a3b8;">No license</span>`;
        if (tierInfo) tierInfo.classList.add("hidden");
        if (btn) {
            btn.classList.remove("hidden");
            btn.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:6px;">
                    <button onclick="buyLicenseTier('basic')">Basic — ${formatMoney(2500)}</button>
                    <button onclick="buyLicenseTier('standard')">Standard — ${formatMoney(10000)}</button>
                    <button onclick="buyLicenseTier('enterprise')">Enterprise — ${formatMoney(50000)}</button>
                </div>
            `;
        }
        if (formCard) formCard.classList.add("hidden");
    }
}


async function loadMyRequests() {
    const container = document.getElementById("my-requests-list");
    if (!container) return;

    const { data: requests, error } = await supabaseClient
        .from("CompanyRequests")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false });

    if (error || !requests || !requests.length) {
        container.innerHTML = "<p style=\"color:#94a3b8;\">No pending requests.</p>";
        return;
    }

    container.innerHTML = "";
    requests.forEach(req => {
        const row = document.createElement("div");
        row.className = "request-row";
        const statusColor = req.status === 'pending' ? '#eab308' : req.status === 'approved' ? '#22c55e' : '#ef4444';
        row.innerHTML = `
            <div>
                <strong>${escapeHTML(req.name)} (${escapeHTML(req.symbol)})</strong>
                <span>${formatCategory(req.category)} · ${formatNumber(req.requested_shares)} shares requested</span>
            </div>
            <div style="color:${statusColor};font-weight:700;text-transform:uppercase;font-size:11px;">${req.status}</div>
            <div>${formatDate(req.created_at)}</div>
            ${req.admin_notes ? `<div style="color:#94a3b8;font-size:12px;margin-top:4px;">Note: ${escapeHTML(req.admin_notes)}</div>` : ''}
        `;
        container.appendChild(row);
    });
}


function renderMyCompaniesList(companies, profile) {
    const container = document.getElementById("my-companies-list");
    if (!container) return;

    const config = profile?.license_tier ? LICENSE_TIERS[profile.license_tier] : null;

    if (!companies.length) {
        container.innerHTML = `
            <p style="color:#94a3b8;">No companies yet.</p>
            <p style="color:var(--muted);font-size:12px;margin-top:8px;">
                Each company costs ${config ? formatMoney(config.establishmentFee) : formatMoney(5000)} to establish (paid on approval).
            </p>
        `;
        return;
    }

    container.innerHTML = "";
    companies.forEach(asset => {
        const now = new Date();
        const paidUntil = asset.listing_fee_paid_until ? new Date(asset.listing_fee_paid_until) : null;
        const isDelisted = asset.is_delisted === true || (paidUntil && paidUntil < now);
        const daysLeft = paidUntil ? Math.ceil((paidUntil - now) / (1000 * 60 * 60 * 24)) : 0;

        const row = document.createElement("div");
        row.className = "company-row" + (isDelisted ? " delisted" : "");

        let feeStatus = '';
        if (isDelisted) {
            feeStatus = `<span style="color:#ef4444;font-weight:700;">DELISTED</span>`;
        } else if (daysLeft <= 3) {
            feeStatus = `<span style="color:#eab308;font-weight:700;">${daysLeft}d left</span>`;
        } else {
            feeStatus = `<span style="color:#22c55e;">${daysLeft}d left</span>`;
        }

        row.innerHTML = `
            <div class="company-info" onclick="${isDelisted ? '' : `loadAssetDetail('${asset.id}')`}">
                <strong>${escapeHTML(asset.name)} ${isDelisted ? '⚠️' : ''}</strong>
                <span>${escapeHTML(asset.symbol)} · ${formatCategory(asset.category)}</span>
                <span style="color:var(--muted);font-size:12px;">Founder shares: ${formatNumber(asset.founder_shares || 0)} · Commission: ${asset.commission_rate || 0}%</span>
            </div>
            <div class="company-stats">
                <div>${formatMoney(asset.price)}</div>
                <div>${formatMoney(asset.market_cap || 0)}</div>
                <div>${feeStatus}</div>
            </div>
            <div class="company-actions">
                ${!isDelisted ? `<button class="secondary" onclick="event.stopPropagation();loadChat('${asset.id}');">Message</button>` : ''}
                <button onclick="event.stopPropagation();payListingFee('${asset.id}')">Pay Fee</button>
            </div>
        `;
        container.appendChild(row);
    });
}


async function submitCompanyRequest(event) {
    event.preventDefault();
    if (!currentUser) return;

    const message = document.getElementById("establish-message");
    const name = document.getElementById("establish-name")?.value.trim();
    const symbol = document.getElementById("establish-symbol")?.value.trim().toUpperCase();
    const shares = Number(document.getElementById("establish-shares")?.value);

    if (!name || !symbol || !Number.isInteger(shares) || shares <= 0) {
        if (message) { message.textContent = "Please fill in all fields correctly."; message.style.color = "#ef4444"; }
        return;
    }

    if (message) { message.textContent = "Submitting request..."; message.style.color = ""; }

    try {
        const { data, error } = await supabaseClient.rpc("submit_company_request", {
            p_name: name,
            p_symbol: symbol,
            p_requested_shares: shares
        });
        if (error) throw error;

        if (data.success) {
            if (message) { message.textContent = data.message; message.style.color = "#22c55e"; }
            document.getElementById("establish-form")?.reset();
            await loadMyCompanies();
        } else {
            if (message) { message.textContent = data.message; message.style.color = "#ef4444"; }
        }
    } catch (err) {
        console.error("Request error:", err);
        if (message) { message.textContent = err.message || "Could not submit request."; message.style.color = "#ef4444"; }
    }
}


async function payListingFee(assetId) {
    if (!currentUser) return;

    try {
        const { data, error } = await supabaseClient.rpc("pay_listing_fee", {
            p_asset_id: assetId
        });
        if (error) throw error;

        if (data.success) {
            alert(data.message);
            await loadMyCompanies();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error("Fee payment error:", err);
        alert(err.message || "Could not pay fee.");
    }
}


// ============================================================
// ADMIN: REDEMPTION CODES
// ============================================================

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
        container.innerHTML = "<p style=\"color:#94a3b8;\">No codes created yet.</p>";
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
            <div>
                <strong>${escapeHTML(code.code)}</strong>
                <span>${formatMoney(code.reward_amount)} · ${code.uses_count}/${code.max_uses} uses</span>
            </div>
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


// ============================================================
