// ------------------------------------------------------------
// PAGE MANAGEMENT
// ------------------------------------------------------------

function showPage(pageId) {
    document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
    const el = document.getElementById(pageId);
    if (el) el.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ------------------------------------------------------------
// AUTH
// ------------------------------------------------------------

async function register(username, email, password) {
    const msg = document.getElementById("signup-message");
    if (msg) msg.textContent = "Creating account...";

    try {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.user) throw new Error("Account could not be created.");

        const mkmId = generateMKMId();

        const { error: profileError } = await supabaseClient
            .from("Profiles")
            .insert({
                id: data.user.id,
                mkm_id: mkmId,
                username,
                display_name: username,
                bio: "",
                status: "active",
                balance: 10000
            });

        if (profileError) throw profileError;

        if (msg) {
            msg.textContent = "Account created! You can now log in.";
            msg.style.color = "var(--green-bright)";
        }
        document.getElementById("signup-form")?.reset();

    } catch (err) {
        console.error("[MKM] Register error:", err);
        if (msg) {
            msg.textContent = err.message || "Registration failed.";
            msg.style.color = "var(--red-bright)";
        }
    }
}

function generateMKMId() {
    return `MKM-${Math.floor(100000 + Math.random() * 900000)}`;
}

async function login(email, password) {
    console.log("[MKM] login() called");
    const msg = document.getElementById("login-message");
    if (msg) {
        msg.textContent = "Logging in...";
        msg.style.color = "var(--muted)";
    }

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;

        console.log("[MKM] signInWithPassword success:", data.user?.id);
        currentUser = data.user;
        await loadDashboard("login");

    } catch (err) {
        console.error("[MKM] Login error:", err);
        if (msg) {
            msg.textContent = err.message || "Login failed.";
            msg.style.color = "var(--red-bright)";
        }
    }
}

async function logout() {
    await supabaseClient.auth.signOut();
    currentUser = null;
    currentProfile = null;
    currentAsset = null;
    showPage("landing");
}

// ------------------------------------------------------------
// SESSION
// ------------------------------------------------------------

async function checkSession() {
    console.log("[MKM] checkSession() running");
    try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;

        if (data.session) {
            console.log("[MKM] Existing session found");
            currentUser = data.session.user;
            await loadDashboard("session");
        } else {
            console.log("[MKM] No session");
            showPage("landing");
        }
    } catch (err) {
        console.error("[MKM] Session check error:", err);
        showPage("landing");
    }
}

// ------------------------------------------------------------
// DASHBOARD
// ------------------------------------------------------------

async function loadDashboard(source = "auto") {
    console.log("[MKM] loadDashboard() called from", source);

    if (!currentUser) {
        const { data, error } = await supabaseClient.auth.getUser();
        if (error || !data.user) {
            console.log("[MKM] No user, sending to landing");
            showPage("landing");
            return;
        }
        currentUser = data.user;
    }

    let { data: profile, error } = await supabaseClient
        .from("Profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (error) {
        console.error("[MKM] Profile fetch error:", error);
        if (source === "login") {
            const msg = document.getElementById("login-message");
            if (msg) {
                msg.textContent = "Database error: " + error.message;
                msg.style.color = "var(--red-bright)";
            }
        }
        return;
    }

    if (!profile) {
        console.warn("[MKM] No profile row — creating one for", currentUser.id);
        const mkmId = generateMKMId();
        const fallbackName = currentUser.email?.split("@")[0] || "user";

        const { data: newProfile, error: insertErr } = await supabaseClient
            .from("Profiles")
            .insert({
                id: currentUser.id,
                mkm_id: mkmId,
                username: fallbackName,
                display_name: fallbackName,
                bio: "",
                status: "active",
                balance: 10000
            })
            .select()
            .single();

        if (insertErr) {
            console.error("[MKM] Profile create error:", insertErr);
            if (source === "login") {
                const msg = document.getElementById("login-message");
                if (msg) {
                    msg.textContent = "Profile setup failed: " + insertErr.message;
                    msg.style.color = "var(--red-bright)";
                }
            }
            return;
        }
        profile = newProfile;
    }

    currentProfile = profile;
    console.log("[MKM] Profile loaded:", profile.username);

    setText("dashboard-username", profile.display_name || profile.username || "User");
    setText("dashboard-mkm-id", profile.mkm_id || "—");
    setText("balance", formatMoney(profile.balance || 0));
    setText("account-status", profile.status || "—");
    setText("account-username", profile.username || "—");
    setText("account-created", formatDate(profile.created_at));
    setText("account-license", profile.company_license ? "Licensed" : "None");

    const licenseText = document.getElementById("dashboard-license-text");
    const tierButtons = document.getElementById("dashboard-tier-buttons");
    if (licenseText) {
        const tier = profile.license_tier;
        const slots = profile.license_slots || 0;
        const config = tier ? LICENSE_TIERS[tier] : null;
        if (config && slots > 0) {
            licenseText.innerHTML = `<span style="color:#22c55e;font-weight:700;">${config.name} License</span> — ${slots} slot(s)`;
            if (tierButtons) tierButtons.classList.add("hidden");
        } else {
            licenseText.innerHTML = `Status: <span style="color:#94a3b8;">No license</span> — Choose a tier below.`;
            if (tierButtons) tierButtons.classList.remove("hidden");
        }
    }

    const portfolioValue = await calculatePortfolioValue();
    setText("portfolio", formatMoney(portfolioValue.value));
    setText("pnl", formatSignedMoney(portfolioValue.pnl));
    applyTrendStyle(document.getElementById("pnl"), portfolioValue.pnl);

    const adminButton = document.getElementById("admin-button");
    if (adminButton) {
        adminButton.classList.toggle("hidden", currentUser.id !== MKM_OWNER_ID);
    }

    console.log("[MKM] Showing dashboard");
    showPage("dashboard");
}