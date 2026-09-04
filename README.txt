# MKM Exchange — Split JavaScript

The original `app.js` was split into ordered classic JavaScript files without
rewriting the code inside the sections.

## Files

1. `01-core.js` — Supabase, constants, shared state, category behaviour
2. `02-auth-session-dashboard.js` — auth, session, dashboard
3. `03-portfolio-transactions.js` — portfolio and transactions
4. `04-profile.js` — profile loading/editing/rendering
5. `05-market.js` — market listing/search/movers
6. `06-asset-trading.js` — asset detail and trading
7. `07-chart.js` — chart and chart data
8. `08-admin.js` — admin, companies, market settings/events, price history
9. `09-market-simulation.js` — browser market simulation/timer
10. `10-news.js` — news
11. `11-code-redemption-license.js` — code redemption and company licensing
12. `12-my-companies.js` — user's companies
13. `13-social-people-profile-chat.js` — social, people, public profiles, chat
14. `14-listeners-init.js` — global listeners, form listeners, helpers, initialization

## How to use

Put all files in the same folder as your HTML.

If your HTML currently has:

    <script src="app.js"></script>

you can keep that single tag and use the included `app.js` loader.

If your old `app.js` was named differently, rename the included loader to the
old filename so the HTML does not need to change.

## Important

The sections are kept in their original order because the app uses shared
classic-script globals. Do not alphabetize the script files or load them in a
different order.
