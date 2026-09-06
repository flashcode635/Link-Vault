# Project Architecture & Design Decisions Log

This document records key design, UX, and architectural decisions made for the **Link Vault** application, complete with timestamps and rationales.

---

### [2026-09-05 21:15:00 UTC] - Standardize Project Identity to "Link Vault"

- **Context**: The application had inconsistent names ("brain valut", "secondbrain", "BrainVault"). The user specified keeping "Link Vault" everywhere with a serif "LV" badge.
- **Decision**: Updated project metadata in `metadata.json`, HTML `<title>` and `<meta>` tags in `templates/base.html`, server view titles in `brain/views_web.py`, and modal texts across `dashboard.html`, `login.html`, `register.html`, `shared_brain.html`, and `404.html`.
- **Outcome**: Consistent, professional branding across both client and server layers.

---

### [2026-09-05 21:40:00 UTC] - Route Relocation: Move API Documentation to `/api-refrances`

- **Context**: API references were previously displayed in a modal or mixed into the main dashboard navigation, cluttering the curation experience.
- **Decision**: Routed API reference documentation to a dedicated URL path (`/api-refrances/`) in `brain/urls.py` and `brain/views_web.py`.
- **Outcome**: A clean separation of concerns between curator workspace actions and developer API specifications.

---

### [2026-09-05 22:10:00 UTC] - Elimination of Emojis in Favor of Crisp SVG Icons

- **Context**: The previous implementation utilized Unicode emoji icons (e.g., 📺, 🐦, 📄) which varied unpredictably across operating systems and broke visual refinement.
- **Decision**: Replaced all emojis with standardized, monochrome SVG vector icons for YouTube, Twitter / X (official logo mark), articles, documents, navigation items, and action buttons.
- **Outcome**: A consistent visual aesthetic matching Notion-style curation workspaces.

---

### [2026-09-05 22:35:00 UTC] - Mobile-First App Navigation & Bottom Bar

- **Context**: The mobile experience needed to feel like a native mobile app rather than a shrunken desktop site.
- **Decision**: Implemented a sticky bottom navigation bar (`fixed bottom-0 z-30`) on mobile screens (`md:hidden`) with high-contrast SVG icons for Home, Filters, Quick Add, and API Ref.
- **Outcome**: Seamless one-handed navigation on mobile devices with touch targets exceeding 44px.

---

### [2026-09-05 22:45:00 UTC] - Removal of "Django & Async Py" Marketing Slogans

- **Context**: The UI contained promotional subtitle strings ("Django & Async Py", "Powered by Django 5.2 Async") that detracted from the clean workspace aesthetic.
- **Decision**: Completely removed all occurrences of the tagline from user-facing navigation bars, headers, and modals.
- **Outcome**: Uncluttered, minimalist workspace focusing entirely on user-curated knowledge.

---

### [2026-09-05 22:55:00 UTC] - Dashboard Layout Revamp Based on Reference Design

- **Context**: The user provided a UI reference image depicting a "Curator Workspace" with a serif "BV" badge, "Curated Stream" heading, Active Scope breadcrumbs, and a quick capture bar.
- **Decision**: Redesigned `templates/dashboard.html` with:
  1. _Header & Sidebar_: "Curator Workspace" with Playfair Display "BV" icon.
  2. _Active Scope Bar_: Breadcrumb showing current filter scope (`Active Scope / Platform • TWITTER / X`) with a quick-dismiss button (`[×]`).
  3. _Quick Capture Bar_: Full-width input bar at the bottom for instant URL and thought capturing.
  4. _Feed Header_: Showing items count metric (`Showing X of Y items`) and sort dropdown menu.
- **Outcome**: A refined, modern curation layout matching the reference mockup.

---

### [2026-09-05 23:05:00 UTC] - Knowledge View Filtering Bug Fix (Preserve Master Counts)

- **Context**: When selecting a specific platform filter (e.g., YouTube or Twitter / X), the counts for all other categories dropped to 0, and "All Content" count became equal to the filtered count.
- **Root Cause Analysis**: `fetchContent()` fetched only the filtered items from the server and replaced `appState.content`. Then `updateBadgeCounts()` calculated badge counts exclusively from `appState.content`.
- **Decision**:
  1. Introduced `appState.allContent` as the single source of truth for the curator's entire library.
  2. In `app.js`, `fetchAllContent()` loads all items once, and `applyFilters()` computes the visible `appState.content` slice for rendering.
  3. `updateBadgeCounts()` now calculates category badges (YouTube, Twitter / X, Articles, Documents, and Folders) directly from `appState.allContent`.
- **Outcome**: When switching between YouTube, Twitter / X, Articles, or Folders, all category counts remain visible, accurate, and unchanged, while the card feed displays exclusively the chosen filter.
