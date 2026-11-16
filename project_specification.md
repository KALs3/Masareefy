# Project Specification: Telegram AI Expense Tracker & Mini App Dashboard

## 1. Overview
A frictionless, multi-user personal finance and expense-tracking system combining a **Telegram Bot** for rapid daily expense logging (via natural language text, voice notes, and receipt images) with an embedded **Telegram Mini App (Web Dashboard)** for interactive analytics, budgeting, and transaction management.

### Target Audience & Goals
* **Primary Users:** Creator and a close circle of friends (multi-tenant architecture with strict user data isolation).
* **Portfolio Value:** Demonstrates event-driven bot architecture, multimodal LLM integration with structured outputs, passwordless HMAC cryptographic authentication, and full-stack dashboard visualization.
* **Hosting Budget:** $0/month (leveraging generous free tiers across Supabase, Vercel, Render/Railway/Fly.io, and Google AI Studio).

---

## 2. System Architecture

```text
┌───────────────────┐       Webhook (HTTPS)       ┌─────────────────────────────┐
│   Telegram App    │ ──────────────────────────► │      Backend API Server     │
│ (Text/Voice/Photo)│ ◄────────────────────────── │   (FastAPI / Node.js)       │
└───────────────────┘      Bot Reply + Buttons    └──────────────┬──────────────┘
         │                                                       │
         │ Opens WebView                                         ├──► Gemini 2.5 Flash API
         │ (Passes initData)                                     │    (Multimodal Extraction)
         ▼                                                       │
┌───────────────────┐       REST API (HTTPS)      ┌──────────────▼──────────────┐
│ Telegram Mini App │ ──────────────────────────► │    PostgreSQL Database      │
│ (Next.js + Charts)│   Header: X-Telegram-Auth   │         (Supabase)          │
└───────────────────┘                             └─────────────────────────────┘
```

### Recommended Tech Stack
* **Backend:** Python (`FastAPI` + `aiogram` v3) *or* TypeScript (`Hono`/`Express` + `grammY`).
* **Database:** PostgreSQL hosted on **Supabase** (using SQLAlchemy/Prisma or raw asyncpg).
* **AI / Multimodal Engine:** **Gemini 2.5 Flash** (via Google GenAI SDK using Structured Outputs / Pydantic schemas).
* **Frontend (Mini App):** **Next.js (App Router)**, Tailwind CSS, `shadcn/ui`, `Recharts` (or `Chart.js`), and `@twa-dev/sdk`.
* **Deployment:** Vercel (Frontend) + Render / Railway / Fly.io (Backend).

---

## 3. Core Features

### Phase 1: Telegram Bot (Input & Quick Actions)
1. **Zero-Friction Onboarding (`/start`):**
   * Automatically registers the user via their unique Telegram `user_id`.
   * Prompts the user to select their default currency via inline buttons (`EGP`, `USD`, `EUR`, `SAR`, `AED`, or custom).
   * Seeds default expense categories (`Food & Dining`, `Transport`, `Groceries`, `Bills & Utilities`, `Shopping`, `Entertainment`, `Health`, `Other`).
2. **Multimodal Expense Logging:**
   * **Text:** `"150 coffee and croissant"` or `"paid 420 for uber"`
   * **Voice Notes:** User sends an `.ogg` voice note $\rightarrow$ downloaded in memory $\rightarrow$ passed directly to Gemini Flash $\rightarrow$ transcribed and parsed into structured JSON.
   * **Receipts / Screenshots:** User sends a photo of a paper receipt or bank/InstaPay transfer screenshot $\rightarrow$ Gemini Flash extracts total amount, merchant name, date, and category.
3. **Interactive Confirmation Messages:**
   * Upon logging an expense, the bot replies with a clean summary:
     > ✅ **Logged:** 150.00 EGP — *Coffee and croissant*  
     > 📁 **Category:** Food & Dining  
     > 📊 **Spent Today:** 320.00 EGP
   * **Inline Keyboard Actions attached to confirmation:**
     * `[ ❌ Undo ]` — Deletes the transaction immediately.
     * `[ ✏️ Category ]` — Opens a quick grid of categories to re-assign if the AI guessed wrong.
4. **Quick Chat Commands:**
   * `/today` — Text summary of today's expenses.
   * `/month` — Breakdown of current month spending by category + budget progress bars (ASCII/emoji bars).
   * `/dashboard` — Sends an inline button that launches the Telegram Mini App directly inside Telegram.
   * `/export` — Generates and sends a `.csv` file of all user transactions.

### Phase 2: Telegram Mini App (Web Dashboard)
1. **Passwordless Authentication:**
   * Frontend grabs `window.Telegram.WebApp.initData`.
   * Every API request includes `Authorization: tma <initData>`.
   * Backend validates the HMAC-SHA256 signature using the `TELEGRAM_BOT_TOKEN` to securely identify the `user_id`.
2. **Analytics & Visualizations:**
   * **KPI Summary Cards:** Total Spent (Current Period), Daily Average, Top Category, Remaining Monthly Budget.
   * **Category Breakdown:** Interactive Donut/Pie chart showing percentage and total per category.
   * **Spending Trend:** Bar/Line chart showing daily spending over the selected timeframe (`7D`, `30D`, `This Month`, `Custom Range`).
3. **Transaction Management:**
   * Searchable, filterable list of all expenses.
   * Ability to edit an expense (amount, description, category, date) or delete it.
   * Manual "+ Add Expense" modal for desktop/web convenience.
4. **Budget & Category Settings:**
   * Set monthly spending limits (overall and/or per category).
   * Add custom categories with custom emojis.

---

## 4. Database Schema (PostgreSQL)

```sql
-- 1. Users Table
CREATE TABLE users (
    telegram_id BIGINT PRIMARY KEY,
    username VARCHAR(255),
    first_name VARCHAR(255),
    currency VARCHAR(10) DEFAULT 'EGP',
    monthly_budget NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Categories Table (Seeded per user on /start)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    emoji VARCHAR(10) DEFAULT '💸',
    budget_limit NUMERIC(12, 2) DEFAULT NULL,
    UNIQUE(user_id, name)
);

-- 3. Expenses Table
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    description VARCHAR(255) NOT NULL,
    source_type VARCHAR(20) DEFAULT 'text', -- 'text', 'voice', 'image', 'web'
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast dashboard queries
CREATE INDEX idx_expenses_user_date ON expenses(user_id, expense_date DESC);
CREATE INDEX idx_expenses_category ON expenses(category_id);
```

---

## 5. AI Extraction Pipeline (Structured Output)

When a message (text, audio, or image) arrives, the backend fetches the user's existing category names and passes the input to **Gemini 2.5 Flash** enforcing a strict JSON schema.

### Expected JSON Schema
```json
{
  "is_expense": true,
  "expenses": [
    {
      "amount": 150.00,
      "currency": "EGP",
      "description": "Coffee and croissant",
      "category": "Food & Dining",
      "expense_date": "2026-11-15"
    }
  ],
  "reply_message": "Logged 150 EGP for coffee and croissant."
}
```

### Edge Cases Handled by Prompting
* **Multiple items in one message:** *"Paid 100 for taxi and 250 for dinner"* $\rightarrow$ returns an array of 2 separate expense objects.
* **Non-expense chatter:** *"Hey, how are you?"* $\rightarrow$ sets `is_expense: false` and prompts the user with an example of how to log an expense.
* **Date inference:** *"Spent 500 on groceries yesterday"* $\rightarrow$ resolves `"yesterday"` relative to the current date injected into the system prompt.

---

## 6. REST API Endpoints (For Mini App)

All `/api/*` routes require valid Telegram `initData` in the `Authorization` header.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/me` | Get user profile, currency, and monthly budget settings. |
| `PATCH` | `/api/me` | Update user currency or overall monthly budget. |
| `GET` | `/api/dashboard?start_date=...&end_date=...` | Returns aggregated KPIs, category totals, and daily time-series data. |
| `GET` | `/api/expenses?limit=50&offset=0&category_id=...` | Paginated, filterable list of transactions. |
| `POST` | `/api/expenses` | Manually create an expense from the web dashboard. |
| `PATCH` | `/api/expenses/{id}` | Edit an existing expense's amount, category, description, or date. |
| `DELETE` | `/api/expenses/{id}` | Delete an expense. |
| `GET` | `/api/categories` | List all categories for the user. |
| `POST` | `/api/categories` | Create a new custom category. |

---

## 7. Security & Privacy Considerations
1. **Telegram `initData` Verification:** Never trust a `user_id` sent in a plain query string or JSON body from the frontend. Always verify the cryptographic hash of `initData` on the backend and extract the `user.id` from the verified payload.
2. **Row-Level Isolation:** Every SQL query (`SELECT`, `UPDATE`, `DELETE`) must strictly include `WHERE user_id = :authenticated_user_id` so friends cannot access or modify each other's financial records.
3. **Ephemeral Media Processing:** Voice notes and receipt photos downloaded from Telegram servers must be processed in memory (bytes) and discarded immediately after LLM extraction—never stored permanently on disk or public buckets.

---

## 8. Implementation Roadmap

* [ ] **Milestone 1: Core Bot & Database**
  * Set up Supabase PostgreSQL database and run schema migrations.
  * Initialize FastAPI + `aiogram` bot with `/start` onboarding.
  * Integrate Gemini Flash text parsing and inline `[Undo]` / `[Category]` buttons.
* [ ] **Milestone 2: Multimodal Upgrades**
  * Add Telegram voice note (`.ogg`) handler $\rightarrow$ Gemini audio input.
  * Add Telegram photo handler (receipts/screenshots) $\rightarrow$ Gemini vision input.
  * Add `/today`, `/month`, and `/export` CSV commands.
* [ ] **Milestone 3: Telegram Mini App Frontend**
  * Scaffold Next.js app with Tailwind + `shadcn/ui`.
  * Implement `initData` HMAC verification middleware on FastAPI.
  * Build KPI cards, Recharts category donut chart, and daily bar chart.
  * Build transaction table with inline edit/delete modals.
* [ ] **Milestone 4: Polish & Friend Rollout**
  * Configure BotFather Mini App menu button.
  * Add budget alert warnings (e.g., notify user in chat when they hit 80% and 100% of their monthly budget).
  * Share bot link with friends and gather feedback.