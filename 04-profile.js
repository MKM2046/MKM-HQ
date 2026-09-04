// PROFILE
// ============================================================

// ------------------------------------------------------------
// LOAD PROFILE
// ------------------------------------------------------------

async function loadProfile() {

    if (!currentUser) {

        const {
            data
        } = await supabaseClient.auth.getUser();

        if (!data.user) {
            showPage("landing");
            return null;
        }

        currentUser =
            data.user;
    }

    const {
        data: profile,
        error
    } = await supabaseClient
        .from("Profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (error) {

        console.error(
            "Load profile error:",
            error
        );

        return null;
    }

    if (!profile) {

        console.error(
            "Profile not found."
        );

        return null;
    }

    currentProfile =
        profile;

    renderProfile(profile);

    showPage("profile-page");

    return profile;
}


// ============================================================
// PROFILE EDITING + PROFILE PICTURE
// ============================================================

async function openProfileEditor() {

    if (!currentUser) {
        await checkSession();
    }

    if (!currentUser) {
        return;
    }

    if (!currentProfile) {
        await loadProfile();
    }

    if (!currentProfile) {
        return;
    }

    const editor =
        document.getElementById("profile-editor");

    const displayInput =
        document.getElementById(
            "profile-display-input"
        );

    const bioInput =
        document.getElementById(
            "profile-bio-input"
        );

    if (displayInput) {
        displayInput.value =
            currentProfile.display_name || "";
    }

    if (bioInput) {
        bioInput.value =
            currentProfile.bio || "";
    }

    editor?.classList.remove("hidden");
}


function closeProfileEditor() {

    document
        .getElementById("profile-editor")
        ?.classList.add("hidden");

    const message =
        document.getElementById(
            "profile-edit-message"
        );

    if (message) {
        message.textContent = "";
    }
}


async function saveProfile() {

    if (!currentUser) {
        return;
    }

    const displayInput =
        document.getElementById(
            "profile-display-input"
        );

    const bioInput =
        document.getElementById(
            "profile-bio-input"
        );

    const avatarInput =
        document.getElementById(
            "profile-avatar-input"
        );

    const message =
        document.getElementById(
            "profile-edit-message"
        );

    const displayName =
        displayInput?.value.trim() || "";

    const bio =
        bioInput?.value.trim() || "";

    if (!displayName) {

        if (message) {
            message.textContent =
                "Display name cannot be empty.";
        }

        return;
    }

    if (message) {
        message.textContent =
            "Saving profile...";
    }

    try {

        let avatarUrl =
            currentProfile?.avatar_url || null;


        // ----------------------------------------------------
        // PROFILE PICTURE
        // ----------------------------------------------------

        const file =
            avatarInput?.files?.[0];

        if (file) {

            const maxSize =
                5 * 1024 * 1024;

            if (file.size > maxSize) {

                throw new Error(
                    "Profile picture must be smaller than 5 MB."
                );
            }

            const allowedTypes = [
                "image/jpeg",
                "image/png",
                "image/webp"
            ];

            if (
                !allowedTypes.includes(
                    file.type
                )
            ) {

                throw new Error(
                    "Please use a JPG, PNG or WebP image."
                );
            }

            const extension =
                file.type === "image/png"
                    ? "png"
                    : file.type === "image/webp"
                        ? "webp"
                        : "jpg";

            const filePath =
                `${currentUser.id}/avatar.${extension}`;

            const {
                error: uploadError
            } = await supabaseClient
                .storage
                .from("profile-pictures")
                .upload(
                    filePath,
                    file,
                    {
                        upsert: true,
                        contentType: file.type,
                        cacheControl: "3600"
                    }
                );

            if (uploadError) {
                throw uploadError;
            }

            const {
                data: publicData
            } = supabaseClient
                .storage
                .from("profile-pictures")
                .getPublicUrl(filePath);

            avatarUrl =
                publicData?.publicUrl || null;
        }


        // ----------------------------------------------------
        // SAVE PROFILE
        // ----------------------------------------------------

        const {
            data: updatedProfile,
            error
        } = await supabaseClient
            .from("Profiles")
            .update({
                display_name: displayName,
                bio,
                avatar_url: avatarUrl
            })
            .eq(
                "id",
                currentUser.id
            )
            .select()
            .single();

        if (error) {
            throw error;
        }

        currentProfile =
            updatedProfile;


        // ----------------------------------------------------
        // UPDATE PROFILE DISPLAY
        // ----------------------------------------------------

        renderProfile(
            updatedProfile
        );

        if (message) {
            message.textContent =
                "Profile updated successfully.";
        }

        if (avatarInput) {
            avatarInput.value = "";
        }

        setTimeout(
            closeProfileEditor,
            800
        );

    } catch (error) {

        console.error(
            "Profile update error:",
            error
        );

        if (message) {
            message.textContent =
                error.message ||
                "Could not update profile.";
        }
    }
}


// ============================================================
// PROFILE RENDERING
// ============================================================

function renderProfile(profile) {

    if (!profile) {
        return;
    }

    setText(
        "profile-username",
        profile.username
            ? `@${profile.username}`
            : "@—"
    );

    setText(
        "profile-display-name",
        profile.display_name ||
        profile.username ||
        "—"
    );

    setText(
        "profile-mkm-id",
        profile.mkm_id ||
        "—"
    );

    setText(
        "profile-status",
        profile.status ||
        "Active"
    );

    setText(
        "profile-bio",
        profile.bio ||
        "No bio yet."
    );

    setText(
        "profile-created",
        formatDate(
            profile.created_at
        )
    );


    const avatar =
        document.getElementById(
            "profile-avatar"
        );

    const placeholder =
        document.getElementById(
            "profile-avatar-placeholder"
        );

    if (
        profile.avatar_url &&
        avatar
    ) {

        avatar.src =
            `${profile.avatar_url}?v=${Date.now()}`;

        avatar.classList.remove(
            "hidden"
        );

        placeholder?.classList.add(
            "hidden"
        );

    } else {

        avatar?.classList.add(
            "hidden"
        );

        if (placeholder) {

            placeholder.classList.remove(
                "hidden"
            );

            const name =
                profile.display_name ||
                profile.username ||
                "?";

            placeholder.textContent =
                name
                    .charAt(0)
                    .toUpperCase();
        }
    }
}


// ============================================================
