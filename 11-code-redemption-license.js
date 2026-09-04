// CODE REDEMPTION
// ============================================================

async function redeemCode() {
    const input = document.getElementById("redeem-code-input");
    const message = document.getElementById("redeem-message");
    const code = input?.value.trim();

    if (!code) {
        if (message) { message.textContent = "Enter a code."; message.style.color = "#ef4444"; }
        return;
    }
    if (!currentUser) {
        if (message) { message.textContent = "Please log in."; message.style.color = "#ef4444"; }
        return;
    }

    if (message) { message.textContent = "Redeeming..."; message.style.color = ""; }

    try {
        const { data, error } = await supabaseClient.rpc("redeem_code", {
            p_code: code,
            p_user_id: currentUser.id
        });
        if (error) throw error;

        if (data.success) {
            if (message) {
                message.textContent = `${data.message} +${formatMoney(data.reward)}`;
                message.style.color = "#22c55e";
            }
            if (input) input.value = "";
            await loadDashboardDataOnly();
        } else {
            if (message) { message.textContent = data.message; message.style.color = "#ef4444"; }
        }
    } catch (err) {
        console.error("Redeem error:", err);
        if (message) { message.textContent = err.message || "Redemption failed."; message.style.color = "#ef4444"; }
    }
}


// ============================================================
// COMPANY LICENSE
// ============================================================

async function buyLicenseTier(tier) {
    if (!currentUser) { alert("Please log in."); return; }

    const config = LICENSE_TIERS[tier];
    if (!config) return;

    const confirmation = confirm(
        `Buy ${config.name} License for ${formatMoney(config.price)}?\n\n` +
        `• Adds ${config.slots} company slot(s)\n` +
        `• Max shares per company: ${formatNumber(config.maxShares)}\n` +
        `• Commission rate: ${config.commissionRate}% per trade\n` +
        `• Establishment fee: ${formatMoney(config.establishmentFee)} per company\n` +
        `• Weekly listing fee: ${formatMoney(config.weeklyFee)} per company`
    );
    if (!confirmation) return;

    try {
        const { data, error } = await supabaseClient.rpc("buy_company_license_tier", {
            p_tier: tier
        });
        if (error) throw error;

        if (data.success) {
            alert(data.message);
            await loadDashboardDataOnly();
            const myCompaniesPage = document.getElementById("my-companies");
            if (myCompaniesPage && !myCompaniesPage.classList.contains("hidden")) {
                await loadMyCompanies();
            } else {
                await loadDashboard();
            }
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error("License purchase error:", err);
        alert(err.message || "Could not purchase license.");
    }
}

// Legacy wrapper for old calls
async function buyCompanyLicense() {
    await buyLicenseTier("basic");
}


// ============================================================
