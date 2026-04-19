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
2. **Dashboard (Home)** — Balance card, monthly income/expense, 6-month bar rhythm, recent activity, quick actions (Add transaction / Budgets).
3. **Activity (Transactions)** — Full CRUD with **tap-to-edit** rows, inline pencil and trash icon on every row, long-press shortcut to delete, search + filter chips (All / Income / Expense). When editing, the Add-Transaction screen pre-fills all fields, hides the Frequency picker, and exposes a header trash icon for one-tap delete.
4. **Add / Edit transaction screen** — Type toggle, large amount entry, description, category grid, **date picker (YYYY-MM-DD + "Today" quick-set)**, Frequency picker (one-time + six recurring cadences), AI category suggestion button (Claude classifies description → category id). Doubles as the edit screen via route params.
5. **Budgets** — Per-category monthly budget with live `spent` calculation and progress bars. Upserts per (user, category, month).
6. **Savings goals** — Create/delete goals with target + deadline, contribute any amount, progress bars.
7. **Recurring transactions** — Set any transaction to repeat on one of six cadences (daily, weekly, biweekly, monthly, quarterly, yearly). Backend auto-materialises due instances lazily on every read (dashboard, transactions list, recurring list). Rules can be paused/resumed or removed (with optional cleanup of generated history). Each auto-generated transaction carries a visible "Recurring" badge.
8. **AI Insights** — Claude Sonnet 4.5 reads the last 150 transactions and returns: summary, top categories, anomalies (with severity), tips, next-month forecast. Graceful deterministic fallback if the LLM errors out.
9. **Profile** — User info, currency display, shortcuts to budgets / recurring / AI, sign out.

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
| GET  | /dashboard/summary | Aggregated metrics |
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
