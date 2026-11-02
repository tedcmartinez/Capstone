# Cornerblock Inventory System

LAN-Based Materials Inventory Management System with Email Notification for
**Cornerblock Trading Inc.**

This is a BSIT capstone project. It runs on a local area network (LAN) and lets
staff track materials, record stock in/out, and automatically email a reorder
alert to management when a material drops to or below its threshold.

## Tech Stack

- **PHP** (custom MVC structure — `app/`, `core/`, `public/`)
- **MySQL / MariaDB** (via XAMPP)
- **PHPMailer** for Gmail SMTP email notifications
- **Composer** for dependency management

## Setup

1. **Database** — create the database, then import the schema and seed data:
   - Import `database/schema.sql` (tables and structure)
   - Import `database/seed.sql` (starter data)

2. **Dependencies** — install the PHP packages:
   ```
   composer install
   ```

3. **Email config** — copy `config/email.config.php`, then fill in the Gmail
   account and 16-character **App Password** used to send alerts. (An App
   Password requires 2-Step Verification to be enabled on the Google account.)

4. **Run** — place the project under your web root (e.g. `C:\xampp\htdocs\`)
   and open the app in a browser at the `public/` entry point.

## Notes

- `config/email.config.php` and the `vendor/` folder are intentionally excluded
  from version control.
