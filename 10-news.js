// NEWS
// ============================================================

async function loadNews() {

    const {
        data: news,
        error
    } = await supabaseClient
        .from("News")
        .select(`
            *,
            Assets (
                name,
                symbol
            )
        `)
        .eq(
            "published",
            true
        )
        .order(
            "created_at",
            {
                ascending: false
            }
        );

    if (error) {

        console.error(error);
        return;
    }

    const container =
        document.getElementById("news-list");

    if (!container) {
        return;
    }

    if (!news || news.length === 0) {

        container.innerHTML =
            "<p>No news available.</p>";

        showPage("news");

        return;
    }

    container.innerHTML = "";

    news.forEach(article => {

        const card =
            document.createElement("div");

        card.className = "card";

        card.innerHTML = `
            <h2>
                ${escapeHTML(article.headline)}
            </h2>

            <p>
                ${escapeHTML(article.content)}
            </p>

            <small>
                ${
                    article.Assets
                        ? escapeHTML(
                            article.Assets.symbol
                        )
                        : "MKM Exchange"
                }
                ·
                ${formatDateTime(article.created_at)}
            </small>
        `;

        container.appendChild(card);
    });

    showPage("news");
}


// ============================================================
