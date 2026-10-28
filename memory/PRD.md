# FinanceFocus — Mobile App PRD

## Overview
FinanceFocus is a premium personal-finance mobile app (Expo React Native) that helps people tend to their money like a garden. It tracks income and expenses, sets gentle monthly budgets, nurtures savings goals, and offers an AI coach that reads the user's transactions and suggests improvements.

## Tech stack
- **Frontend:** Expo Router (SDK 54), React Native, TypeScript, expo-secure-store, axios, @expo/vector-icons
- **Backend:** FastAPI, Motor (async Mongo), PyJWT, bcrypt, emergentintegrations
- **DB:** MongoDB
- **AI:** Emergent LLM Key → Anthropic Claude Sonnet 4.5 (via `emergentintegrations`)

## Features shipped
1. **Authentication** — JWT Bearer token auth (register, login, /me, logout). Tokens persisted with `expo-secure-store` on device (localStorage fallback for web preview). Admin user seeded at startup.
2. **Dashboard (Home)** — Monthly carousel at the top (prev/next chevrons + "Jump to current"). Balance card, monthly income/expense, 6-month bar rhythm and recent activity ALL re-render for the selected month. Quick actions (Add transaction · Calendar).
8. **Calendar view** — Tap-a-day month grid with green (income) and red (expense) dots. For future days, projected upcoming recurring transactions appear as faded dots. Tapping any day reveals its full event list with "Recurring" and "Upcoming" pills. Totals at the top split real + upcoming amounts.
3. **Activity (Transactions)** — Full CRUD with **tap-to-edit** rows, inline pencil and trash icon on every row, long-press shortcut to delete, search + filter chips (All / Income / Expense). When editing, the Add-Transaction screen pre-fills all fields, hides the Frequency picker, and exposes a header trash icon for one-tap delete.
4. **Add / Edit transaction screen** — Type toggle, large amount entry, description, category grid, **date picker (YYYY-MM-DD + "Today" quick-set)**, Frequency picker (one-time + six recurring cadences), AI category suggestion button (Claude classifies description → category id). Doubles as the edit screen via route params.
5. **Budgets** — Per-category monthly budget with live `spent` calculation and progress bars. Upserts per (user, category, month).
6. **Savings goals** — Create/delete goals with target + deadline, contribute any amount, progress bars.
7. **Recurring transactions** — Set any transaction to repeat on one of six cadences (daily, weekly, biweekly, monthly, quarterly, yearly). Backend auto-materialises due instances lazily on every read (dashboard, transactions list, recurring list). Rules can be paused/resumed or removed (with optional cleanup of generated history). Each auto-generated transaction carries a visible "Recurring" badge.
8. **AI Insights** — Claude Sonnet 4.5 reads the last 150 transactions and returns: summary, top categories, anomalies (with severity), tips, next-month forecast. Graceful deterministic fallback if the LLM errors out.
10. **Credit Cards tab** — CRUD for cards (balance, limit, APR, statement day, min % + floor, color). Vertical stacked carousel (tap a card to expand it). Payoff schedule modal (Minimum vs Custom payment) with amortization table, computed client-side.
11. **Swipe-to-delete** — On the Dashboard Activity list, swipe a row left to reveal a red trash "Delete" action (the old inline trash icon was removed). Recurring rows ask "Just this one" or "Delete entire series". Upcoming (projected) rows can't be swiped. A drag never counts as a tap, so it won't open edit by mistake. Swiping an expense row RIGHT instantly toggles it Paid/Unpaid (green "Paid" / sand "Unpaid" panel); income rows can't be swiped right. The "incl. … upcoming" note was removed from the Dashboard and Calendar totals.
12. **Upcoming (projected) rows are editable/deletable** — tap or pencil → "Only this transaction" saves an edited copy (POST /api/recurring/{rid}/occurrence, defaults unpaid) or "Update entire series". Swipe left → "Just this one" (POST /api/recurring/{rid}/skip) or delete series. Swipe right on an upcoming expense marks it paid early. Skipped/overridden dates are stored in `recurring_rules.exceptions` and excluded from projection and materialization.
9. **Profile** — User info, **currency picker (10 currencies)**, shortcuts to budgets / recurring / AI, **Reset all data** button (two-step confirm — wipes transactions, recurring rules, budgets, and goals while keeping the account), sign out.

## Design system (from design agent)
"Organic & Earthy" light theme — bone-white canvas (`#F9F8F6`), deep forest green primary (`#1E3F32`), terracotta expense accent (`#C85A40`), moss income accent (`#4A7059`). Manrope-inspired heavy display type, pill buttons, 3xl-rounded cards, soft ambient shadows.

## API surface (all under `/api`, Bearer auth except /auth/*)
| Method | Path | Purpose |
|---|---|---|
| POST | /auth/register | Create account → access_token |
| POST | /auth/login | Login → access_token |
| GET  | /auth/me | Current user |
| POST | /auth/logout | No-op (stateless) |
| GET  | /categories | 15 seeded categories |
| POST/GET/PUT/DELETE | /transactions | CRUD |
| GET  | /dashboard/summary?month=YYYY-MM | Aggregated metrics for the chosen month, **including projected recurring totals** when month is current/future |
| GET  | /calendar?month=YYYY-MM | Per-day income/expense aggregates including projected recurring |
| GET  | /users/currencies | List supported currencies |
| PATCH| /users/me | Update currency / name |
| POST | /users/me/reset | Wipe all financial data for current user |
| POST/GET/DELETE | /budgets | Per-month budgets (upsert) |
| POST/GET/DELETE | /goals | Savings goals |
| POST | /goals/{id}/contribute | Add amount |
| POST/GET/PATCH/DELETE | /recurring | Recurring rules (PATCH toggles active) |
| POST | /ai/insights | AI spending analysis |
| POST | /ai/suggest-category | AI category classification |

## Seeded admin credentials
See `/app/memory/test_credentials.md` — `admin@financefocus.app` / `admin123`.

## Smart business enhancement (shareability & retention)
The **AI Insights** screen turns a utilitarian tracker into a shareable moment: the Claude-generated summary + forecast feels like a quarterly money-horoscope users want to screenshot. Future step: a one-tap "Share my month" card that renders the summary into a branded image, turning every active user into an organic acquisition channel.

## Known non-blocking items
- Tab icons currently reuse one testID across focused/unfocused states — cosmetic, not functional.
- Deprecated RN `shadow*` props in theme (will migrate to `boxShadow` for future Web compatibility).
