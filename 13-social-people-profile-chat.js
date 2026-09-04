// SOCIAL / PEOPLE
// ============================================================

let currentChatPartner = null;
let messageSubscription = null;

async function loadSocial() {
    if (!currentUser) { await checkSession(); return; }
    await loadFollowing();
    await loadFriendRequests();
    showPage("social");
}

async function searchPeople() {
    const input = document.getElementById("people-search");
    const message = document.getElementById("people-search-message");
    const container = document.getElementById("people-search-results");
    const query = input?.value.trim();

    if (!query) {
        if (container) container.innerHTML = "<p>Search for someone to view their profile.</p>";
        return;
    }

    if (message) message.textContent = "Searching...";

    const { data: profiles, error } = await supabaseClient
        .from("Profiles")
        .select("id, username, display_name, avatar_url, mkm_id, bio, status, created_at")
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .neq("id", currentUser.id)
        .limit(20);

    if (error) {
        console.error(error);
        if (message) message.textContent = "Search failed.";
        return;
    }

    if (message) message.textContent = "";
    renderPeopleSearchResults(profiles || []);
}

async function renderPeopleSearchResults(profiles) {
    const container = document.getElementById("people-search-results");
    if (!container) return;

    if (!profiles.length) {
        container.innerHTML = "<p style=\"color:#94a3b8;\">No users found.</p>";
        return;
    }

    // Get follow status for each
    const { data: myFollows } = await supabaseClient
        .from("Follows")
        .select("following_id")
        .eq("follower_id", currentUser.id);

    const { data: myRequests } = await supabaseClient
        .from("FollowRequests")
        .select("receiver_id, status")
        .eq("sender_id", currentUser.id)
        .eq("status", "pending");

    const followingIds = new Set((myFollows || []).map(f => f.following_id));
    const requestedIds = new Set((myRequests || []).map(r => r.receiver_id));

    container.innerHTML = "";
    profiles.forEach(profile => {
        const isFollowing = followingIds.has(profile.id);
        const isRequested = requestedIds.has(profile.id);

        let buttonText = "Follow";
        let buttonAction = `sendFollowRequest('${profile.id}')`;
        let buttonClass = "";

        if (isFollowing) {
            buttonText = "Following";
            buttonAction = `unfollowUser('${profile.id}')`;
            buttonClass = "secondary";
        } else if (isRequested) {
            buttonText = "Requested";
            buttonAction = `cancelFollowRequest('${profile.id}')`;
            buttonClass = "secondary";
        }

        const card = document.createElement("div");
        card.className = "people-result-row";
        card.innerHTML = `
            <div class="people-info" onclick="loadPublicProfile('${profile.id}')">
                <div class="people-avatar">
                    ${profile.avatar_url
                        ? `<img src="${escapeHTML(profile.avatar_url)}" alt="">`
                        : `<span>${(profile.display_name || profile.username || "?").charAt(0).toUpperCase()}</span>`
                    }
                </div>
                <div class="people-meta">
                    <strong>${escapeHTML(profile.display_name || profile.username)}</strong>
                    <span>@${escapeHTML(profile.username)}</span>
                </div>
            </div>
            <div class="people-actions">
                <button class="${buttonClass}" onclick="${buttonAction}; event.stopPropagation();">${buttonText}</button>
                <button class="secondary" onclick="loadChat('${profile.id}'); event.stopPropagation();">Message</button>
            </div>
        `;
        container.appendChild(card);
    });
}

async function sendFollowRequest(receiverId) {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient.rpc("send_follow_request", {
            p_receiver_id: receiverId
        });
        if (error) throw error;
        if (data.success) {
            await searchPeople();
            await loadFriendRequests();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert(err.message || "Could not send request.");
    }
}

async function cancelFollowRequest(receiverId) {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient.rpc("cancel_follow_request", {
            p_receiver_id: receiverId
        });
        if (error) throw error;
        if (data.success) await searchPeople();
    } catch (err) {
        console.error(err);
    }
}

async function unfollowUser(userId) {
    if (!currentUser) return;
    if (!confirm("Unfollow this user?")) return;
    try {
        const { data, error } = await supabaseClient.rpc("unfollow_user", {
            p_user_id: userId
        });
        if (error) throw error;
        if (data.success) {
            await searchPeople();
            await loadFollowing();
        }
    } catch (err) {
        console.error(err);
    }
}

async function loadFriendRequests() {
    if (!currentUser) return;

    const { data: requests, error } = await supabaseClient
        .from("FollowRequests")
        .select("id, sender_id, created_at")
        .eq("receiver_id", currentUser.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

    const container = document.getElementById("friend-requests-list");
    if (!container) return;

    if (error) {
        container.innerHTML = "<p>Could not load requests.</p>";
        return;
    }

    if (!requests || !requests.length) {
        container.innerHTML = "<p style=\"color:#94a3b8;\">No friend requests yet.</p>";
        return;
    }

    const senderIds = requests.map(r => r.sender_id);
    const { data: profiles } = await supabaseClient
        .from("Profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", senderIds);

    const profileMap = {};
    (profiles || []).forEach(p => profileMap[p.id] = p);

    container.innerHTML = "";
    requests.forEach(req => {
        const profile = profileMap[req.sender_id];
        const row = document.createElement("div");
        row.className = "people-result-row";
        row.innerHTML = `
            <div class="people-info" onclick="loadPublicProfile('${req.sender_id}')">
                <div class="people-avatar">
                    ${profile?.avatar_url
                        ? `<img src="${escapeHTML(profile.avatar_url)}" alt="">`
                        : `<span>${(profile?.display_name || profile?.username || "?").charAt(0).toUpperCase()}</span>`
                    }
                </div>
                <div class="people-meta">
                    <strong>${escapeHTML(profile?.display_name || profile?.username || "User")}</strong>
                    <span>@${escapeHTML(profile?.username || "—")}</span>
                </div>
            </div>
            <div class="people-actions">
                <button onclick="respondFollowRequest('${req.id}', 'accept'); event.stopPropagation();">Accept</button>
                <button class="secondary" onclick="respondFollowRequest('${req.id}', 'reject'); event.stopPropagation();">Reject</button>
            </div>
        `;
        container.appendChild(row);
    });
}

async function respondFollowRequest(requestId, action) {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient.rpc("respond_follow_request", {
            p_request_id: requestId,
            p_action: action
        });
        if (error) throw error;
        if (data.success) {
            await loadFriendRequests();
            await loadFollowing();
        }
    } catch (err) {
        console.error(err);
        alert(err.message || "Action failed.");
    }
}

async function loadFollowing() {
    if (!currentUser) return;

    const { data: follows, error } = await supabaseClient
        .from("Follows")
        .select(`
            following_id,
            Profiles!Follows_following_id_fkey(username, display_name, avatar_url, id)
        `)
        .eq("follower_id", currentUser.id)
        .order("created_at", { ascending: false });

    const container = document.getElementById("friends-list");
    if (!container) return;

    if (error) {
        container.innerHTML = "<p>Could not load.</p>";
        return;
    }

    if (!follows || !follows.length) {
        container.innerHTML = "<p style=\"color:#94a3b8;\">No friends yet. Find people above!</p>";
        return;
    }

    container.innerHTML = "";
    follows.forEach(f => {
        const profile = f.Profiles;
        const row = document.createElement("div");
        row.className = "people-result-row";
        row.innerHTML = `
            <div class="people-info" onclick="loadPublicProfile('${f.following_id}')">
                <div class="people-avatar">
                    ${profile?.avatar_url
                        ? `<img src="${escapeHTML(profile.avatar_url)}" alt="">`
                        : `<span>${(profile?.display_name || profile?.username || "?").charAt(0).toUpperCase()}</span>`
                    }
                </div>
                <div class="people-meta">
                    <strong>${escapeHTML(profile?.display_name || profile?.username || "User")}</strong>
                    <span>@${escapeHTML(profile?.username || "—")}</span>
                </div>
            </div>
            <div class="people-actions">
                <button class="secondary" onclick="loadChat('${f.following_id}'); event.stopPropagation();">Message</button>
                <button class="secondary" onclick="unfollowUser('${f.following_id}'); event.stopPropagation();">Unfollow</button>
            </div>
        `;
        container.appendChild(row);
    });
}


// ============================================================
// PUBLIC PROFILE
// ============================================================

let currentPublicProfileId = null;

async function loadPublicProfile(userId) {
    if (!currentUser) return;
    currentPublicProfileId = userId;

    const { data: profile, error } = await supabaseClient
        .from("Profiles")
        .select("id, username, display_name, avatar_url, mkm_id, bio, status, created_at, company_license")
        .eq("id", userId)
        .maybeSingle();

    if (error || !profile) {
        alert("User not found.");
        return;
    }

    // Set display
    setText("public-profile-display-name", profile.display_name || profile.username || "—");
    setText("public-profile-username", profile.username ? `@${profile.username}` : "@—");
    setText("public-profile-status", profile.status || "Active");
    setText("public-profile-bio", profile.bio || "No bio.");
    setText("public-profile-mkm-id", profile.mkm_id || "—");
    setText("public-profile-created", formatDate(profile.created_at));

    // Avatar
    const avatar = document.getElementById("public-profile-avatar");
    const placeholder = document.getElementById("public-profile-avatar-placeholder");
    if (profile.avatar_url && avatar) {
        avatar.src = `${profile.avatar_url}?v=${Date.now()}`;
        avatar.classList.remove("hidden");
        placeholder?.classList.add("hidden");
    } else {
        avatar?.classList.add("hidden");
        if (placeholder) {
            placeholder.classList.remove("hidden");
            placeholder.textContent = (profile.display_name || profile.username || "?").charAt(0).toUpperCase();
        }
    }

    // Button state
    const actionBtn = document.getElementById("public-profile-action");
    const msgBtn = document.getElementById("public-profile-message-btn");

    if (actionBtn) {
        const { data: isFollowing } = await supabaseClient
            .from("Follows")
            .select("id")
            .eq("follower_id", currentUser.id)
            .eq("following_id", userId)
            .maybeSingle();

        const { data: isRequested } = await supabaseClient
            .from("FollowRequests")
            .select("id")
            .eq("sender_id", currentUser.id)
            .eq("receiver_id", userId)
            .eq("status", "pending")
            .maybeSingle();

        if (isFollowing) {
            actionBtn.textContent = "Following";
            actionBtn.onclick = () => unfollowUser(userId);
            actionBtn.className = "secondary";
        } else if (isRequested) {
            actionBtn.textContent = "Requested";
            actionBtn.onclick = () => cancelFollowRequest(userId);
            actionBtn.className = "secondary";
        } else {
            actionBtn.textContent = "Follow";
            actionBtn.onclick = () => sendFollowRequest(userId);
            actionBtn.className = "";
        }
    }

    if (msgBtn) {
        msgBtn.onclick = () => loadChat(userId);
        msgBtn.classList.remove("hidden");
    }

    const msgEl = document.getElementById("public-profile-message");
    if (msgEl) msgEl.textContent = "";

    showPage("public-profile");
}


// ============================================================
// CHAT / MESSAGES
// ============================================================

async function loadMessages() {
    if (!currentUser) { await checkSession(); return; }
    await renderConversationList();
    showPage("messages-page");
}

async function renderConversationList() {
    const container = document.getElementById("conversations-list");
    if (!container) return;

    // Get all messages and group by partner
    const { data: messages, error } = await supabaseClient
        .from("Messages")
        .select("sender_id, receiver_id, content, read, created_at")
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order("created_at", { ascending: false });

    if (error) {
        container.innerHTML = "<p>Could not load conversations.</p>";
        return;
    }

    if (!messages || !messages.length) {
        container.innerHTML = "<p style=\"color:#94a3b8;\">No messages yet. Start a chat from someone's profile!</p>";
        return;
    }

    // Group by partner, keep latest message per partner
    const conversations = {};
    messages.forEach(msg => {
        const partnerId = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
        if (!conversations[partnerId]) {
            conversations[partnerId] = { partnerId, latest: msg, unread: 0 };
        }
        if (msg.receiver_id === currentUser.id && !msg.read) {
            conversations[partnerId].unread++;
        }
    });

    // Get partner profiles
    const partnerIds = Object.keys(conversations);
    const { data: profiles } = await supabaseClient
        .from("Profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", partnerIds);

    const profileMap = {};
    (profiles || []).forEach(p => profileMap[p.id] = p);

    container.innerHTML = "";
    Object.values(conversations).forEach(conv => {
        const profile = profileMap[conv.partnerId];
        const row = document.createElement("div");
        row.className = "conversation-row";
        row.onclick = () => loadChat(conv.partnerId);

        const name = escapeHTML(profile?.display_name || profile?.username || "User");
        const preview = escapeHTML(conv.latest.content).substring(0, 40) + (conv.latest.content.length > 40 ? "..." : "");
        const time = formatDateTime(conv.latest.created_at);
        const unreadBadge = conv.unread > 0 ? `<span class="unread-badge">${conv.unread}</span>` : "";

        row.innerHTML = `
            <div class="people-avatar">
                ${profile?.avatar_url
                    ? `<img src="${escapeHTML(profile.avatar_url)}" alt="">`
                    : `<span>${name.charAt(0).toUpperCase()}</span>`
                }
            </div>
            <div class="conversation-meta">
                <div class="conversation-header">
                    <strong>${name}</strong>
                    <span class="conversation-time">${time}</span>
                </div>
                <div class="conversation-preview">
                    ${preview} ${unreadBadge}
                </div>
            </div>
        `;
        container.appendChild(row);
    });
}

async function loadChat(partnerId) {
    if (!currentUser) return;
    currentChatPartner = partnerId;

    // Get partner info
    const { data: profile } = await supabaseClient
        .from("Profiles")
        .select("username, display_name, avatar_url")
        .eq("id", partnerId)
        .maybeSingle();

    setText("chat-partner-name", profile?.display_name || profile?.username || "Chat");
    setText("chat-partner-username", profile?.username ? `@${profile.username}` : "");

    const avatar = document.getElementById("chat-partner-avatar");
    const placeholder = document.getElementById("chat-partner-avatar-placeholder");
    if (profile?.avatar_url && avatar) {
        avatar.src = profile.avatar_url;
        avatar.classList.remove("hidden");
        placeholder?.classList.add("hidden");
    } else {
        avatar?.classList.add("hidden");
        if (placeholder) {
            placeholder.classList.remove("hidden");
            placeholder.textContent = (profile?.display_name || profile?.username || "?").charAt(0).toUpperCase();
        }
    }

    await renderChatMessages();
    await markMessagesRead(partnerId);
    subscribeToMessages();
    showPage("chat-page");
}

async function renderChatMessages() {
    const container = document.getElementById("chat-messages");
    if (!container || !currentChatPartner) return;

    const { data: messages, error } = await supabaseClient
        .from("Messages")
        .select("sender_id, receiver_id, content, read, created_at")
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChatPartner}),and(sender_id.eq.${currentChatPartner},receiver_id.eq.${currentUser.id})`)
        .order("created_at", { ascending: true });

    if (error) {
        container.innerHTML = "<p>Could not load messages.</p>";
        return;
    }

    container.innerHTML = "";
    (messages || []).forEach(msg => {
        const isMe = msg.sender_id === currentUser.id;
        const bubble = document.createElement("div");
        bubble.className = `chat-bubble ${isMe ? "chat-me" : "chat-them"}`;
        bubble.innerHTML = `
            <div class="chat-content">${escapeHTML(msg.content)}</div>
            <div class="chat-time">${formatDateTime(msg.created_at)} ${isMe && msg.read ? "· Read" : ""}</div>
        `;
        container.appendChild(bubble);
    });

    container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
    const input = document.getElementById("chat-input");
    const content = input?.value.trim();

    if (!content || !currentChatPartner || !currentUser) return;

    try {
        const { data, error } = await supabaseClient.rpc("send_message", {
            p_receiver_id: currentChatPartner,
            p_content: content
        });
        if (error) throw error;
        if (data.success) {
            input.value = "";
            await renderChatMessages();
        }
    } catch (err) {
        console.error("Send message error:", err);
    }
}

function subscribeToMessages() {
    if (messageSubscription) {
        supabaseClient.removeChannel(messageSubscription);
        messageSubscription = null;
    }

    messageSubscription = supabaseClient
        .channel("messages-" + currentChatPartner)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "Messages",
                filter: `receiver_id=eq.${currentUser.id}`
            },
            async () => {
                await renderChatMessages();
                await markMessagesRead(currentChatPartner);
            }
        )
        .subscribe();
}

async function markMessagesRead(partnerId) {
    if (!currentUser || !partnerId) return;
    try {
        await supabaseClient.rpc("mark_messages_read", {
            p_partner_id: partnerId
        });
    } catch (err) {
        console.error("Mark read error:", err);
    }
}


// ============================================================
// ADMIN: COMPANY REQUESTS
// ============================================================

async function loadAdminRequests() {
    if (!currentUser || currentUser.id !== MKM_OWNER_ID) return;

    const { data: requests, error } = await supabaseClient
        .from("CompanyRequests")
        .select(`
            id,
            user_id,
            name,
            symbol,
            category,
            requested_shares,
            status,
            created_at
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

    if (error) { console.error(error); return; }

    const container = document.getElementById("admin-requests-list");
    if (!container) return;

    if (!requests || !requests.length) {
        container.innerHTML = "<p style=\"color:#94a3b8;\">No pending requests.</p>";
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

            /*
             * Ensure the new asset has a proper day open
             * so percentage change is meaningful from day one.
             */
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
                        .update({
                            day_open_price: price,
                            last_day_reset: new Date().toISOString()
                        })
                        .eq("id", asset.id);

                    /*
                     * Seed the first price history row so
                     * the chart has data to display immediately.
                     */
                    await recordPriceHistory(
                        asset.id,
                        asset.price,
                        asset.price
                    );
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

        if (data.success) {
            await loadAdminRequests();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert(err.message || "Rejection failed.");
    }
}


// ============================================================
