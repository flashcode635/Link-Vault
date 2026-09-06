# Link Vault

**Link Vault** is a high-performance, asynchronous personal knowledge management application. Designed with a clean, Notion-inspired curation aesthetic, Link Vault allows knowledge workers, researchers, and creators to capture, organize, and reference multi-format content—including YouTube videos, Twitter / X threads, web articles, and research documents.

---

## Key Capabilities & Features

### 1. Curated Stream & Active Scope

- **Live Knowledge Stream**: Unified view of all saved resources with rich metadata cards, source domain indicators, and collapsible quote/annotation callouts.
- **Interactive Embeds**: Inline responsive video playback for YouTube links and structured quote cards for Twitter / X references.
- **Accurate Category Counts**: Filter by platform (YouTube, Twitter / X, Articles, Documents) with a master data store that preserves global counts across all media categories.
- **Active Scope Breadcrumb**: Real-time scope breadcrumb indicating active folder, platform filter, tag, or search term with one-click scope reset.

### 2. Fast Quick Capture

- **Global Quick Capture Input**: Instant submission bar to capture links, videos, articles, or thoughts.
- **Automatic Type Detection**: Identifies YouTube URLs, Twitter/X links, web URLs, and plain text notes automatically.

### 3. Folder & Tag Taxonomy

- **Color-Coded Folders**: Organize knowledge into dedicated thematic folders with dynamic item counters.
- **Mono-Styled Tags**: Inline hash tags (`#tag`) for frictionless, multidimensional cross-referencing.
- **View Switcher**: Toggle between responsive grid and compact list view modes.

### 4. Public Brain Sharing

- **Cryptographic Share Links**: Generate unique, secure read-only public URLs (`/share/<hash>/`) to publish curated collections.
- **Instant Revocation**: Toggle public access on and off at any time.

### 5. Mobile-First App Navigation

- **Fixed App Bottom Bar**: Mobile navigation with SVG icons for Home, Scope Filters, Quick Add, and API Reference.
- **Touch-Friendly Modals**: Sheet modals and touch targets optimized for mobile browsers.

### 6. Dedicated API Documentation Hub

- Available at `/api-refrances` with comprehensive documentation of all asynchronous endpoints, request/response structures, and query parameters.

---

## Architecture & Technology Stack

| Layer                 | Technology                    | Description                                                                                                                   |
| :-------------------- | :---------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| **Backend Framework** | **Django 5.2 (ASGI)**         | Fully asynchronous request/response pipeline handling API and template rendering.                                             |
| **Database Driver**   | **PyMongo 4.9+**              | Native `AsyncMongoClient` connecting asynchronously to MongoDB collections (`users`, `contents`, `folders`, `tags`, `links`). |
| **Database Engine**   | **MongoDB / Motor Mock**      | Supports live MongoDB connection with an automatic fallback engine for zero-configuration testing.                            |
| **Styling & UI**      | **Tailwind CSS & Fonts**      | Tailwind utility classes paired with _Playfair Display_ serif typography for cards and headers, with custom SVG iconography.  |
| **Client Controller** | **Vanilla ES2022 (`app.js`)** | Lightweight client-side reactive state engine managing cache, live filtering, and modal flows.                                |

---

## API Endpoints Reference

All API routes are served under the `/api/v1/` prefix:

### Authentication

- `POST /api/v1/auth/signup`: Register a new curator account (bcrypt password hashing).
- `POST /api/v1/auth/signin`: Authenticate credentials and receive a JWT Bearer token.
- `GET /api/v1/auth/me`: Retrieve current authenticated user profile.

### Knowledge Content

- `GET /api/v1/content`: Retrieve knowledge items. Query parameters: `type`, `folder_id`, `tag`, `q` (search query).
- `POST /api/v1/content`: Create a new knowledge item (`title`, `link`, `type`, `folder_id`, `notes`, `tags`).
- `PUT /api/v1/content/<id>`: Update an existing item.
- `DELETE /api/v1/content/<id>`: Delete an item from the vault.

### Folders & Tags

- `GET /api/v1/folders`: List all folders with item counts.
- `POST /api/v1/folders`: Create a new folder (`name`, `color`).
- `DELETE /api/v1/folders/<id>`: Delete folder (preserves content items in root).
- `GET /api/v1/tags`: Retrieve distinct user tags.

### Sharing

- `GET /api/v1/brain/share`: Check current public sharing status and hash.
- `POST /api/v1/brain/share`: Enable or disable public sharing.
- `GET /share/<hash>/`: Public read-only landing page for shared vaults.

---

## Quickstart & Local Setup

### Prerequisites

- Python 3.10+
- Node.js (for asset compilation or Tailwind tooling)
- MongoDB instance (optional; built-in async mock engine activates automatically if no external database is configured)

### Environment Variables

Configure the following in your environment or `.env` file:

```bash
# Security
DJANGO_SECRET_KEY="your-secret-key"
DEBUG=True
ALLOWED_HOSTS="*"

# MongoDB Connection
MONGO_URI="mongodb://localhost:27017/secondbrain"
MONGO_DB_NAME="secondbrain"
```

### Running the Server

```bash
# Collect static files
python3 manage.py collectstatic --noinput

# Start ASGI Uvicorn server on port 3000
python3 -m uvicorn config.asgi:application --host 0.0.0.0 --port 3000
```
