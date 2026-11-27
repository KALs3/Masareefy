# 📊 Masareefy (مصاريفي)

> **AI-Powered Telegram Expense Tracker & Mini App Dashboard**  
> Track your daily expenses effortlessly using natural text, voice notes, and receipt photos — with per-user AES-256-GCM encryption at rest.

🤖 **Try the Bot:** [@Masareefyy_bot](https://t.me/Masareefyy_bot)

[![Next.js 15](https://img.shields.io/badge/Next.js-15.3-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-AI-8E75B2?logo=google&logoColor=white)](https://ai.google.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## 🌟 What Masareefy Does

**Masareefy (مصاريفي)** is a personal finance assistant built directly into **Telegram**. Instead of manually filling out spreadsheets or navigating complex forms, you can log expenses the same way you send a message to a friend.

Using multimodal AI (**Google Gemini**), the bot automatically extracts the **amount**, **currency**, **merchant/description**, **category**, and **date** from your messages, and gives you an embedded **Telegram Mini App** dashboard for visual spending analytics and budget tracking.

---

## 📱 How to Use It

### 1. Set Up Your Account
Open [@Masareefyy_bot](https://t.me/Masareefyy_bot) on Telegram and send `/start` to initialize your account and choose your default currency (`EGP`, `USD`, `EUR`, `SAR`, or `AED`).

### 2. Log Expenses Naturally
Just send a message in any of these formats:

- **💬 Text (Arabic, Franco-Arab, or English):**
  - `"50 قهوة"`
  - `"دفعت 250 جنيه بنزين"`
  - `"50 gneih 3esh w gbna"`
  - `"120 Uber ride"`
  - Multiple items at once: `"دفعت 300 سوبرماركت و 70 أوبر"`
- **🎙️ Voice Notes:**
  - Record a quick voice note saying what you spent and where (e.g., *"دفعت تمانين جنيه في الصيدلية"*).
- **🧾 Receipts & Screenshots:**
  - Send a photo of a paper receipt, supermarket bill, or an **InstaPay** / bank transfer screenshot.

### 3. Quick Edits & Undo
Every logged expense message includes two inline buttons:
- **`❌ Undo`** — Immediately delete the expense if it was logged by mistake.
- **`✏️ Category`** — Quickly reassign the expense to a different category.

### 4. View Your Dashboard
Send `/dashboard` to open the interactive **Telegram Mini App**, where you can:
- Track your monthly total, daily average, and remaining budget.
- Explore spending trends and category breakdown charts.
- Search, filter, manually add, or delete transactions.
- Set or update your monthly budget limit.

---

## 📋 Available Commands

| Command | Description (EN) | الوصف (AR) |
| :--- | :--- | :--- |
| `/start` | Set up your account and select default currency | إعداد الحساب وتحديد العملة الافتراضية |
| `/today` | View today's spending summary and breakdown | ملخص وتفاصيل مصاريف اليوم |
| `/month` | View monthly spending and budget progress | تقرير الشهر ونسبة استهلاك الميزانية |
| `/dashboard` | Open the interactive Mini App dashboard | فتح لوحة التحكم التفاعلية |
| `/export` | Download all your expenses as a CSV file | تحميل جميع المصاريف في ملف إكسيل (CSV) |
| `/help` | View usage examples, commands, and privacy info | المساعدة وطريقة تسجيل المصاريف |
| `/delete_my_data` | Permanently delete your account and all data | حذف حسابك وجميع بياناتك نهائياً |

---

## 🔒 Privacy & Security

- **Encrypted at Rest:** All expense descriptions are encrypted per user with **AES-256-GCM** using **HKDF-SHA256** key derivation and **AAD** binding before being stored.
- **No Media Storage:** Voice notes and receipt photos are processed in memory only and discarded immediately after extraction.
- **Full Data Control:** You can export your history anytime with `/export` or permanently wipe all your stored data with `/delete_my_data`.

For technical details on the cryptographic design, see [`SECURITY.md`](SECURITY.md).

---

## 📄 License

This project is open-source and licensed under the [MIT License](https://opensource.org/licenses/MIT).
