# Cornerblock Inventory

**Cloud-Based Materials Inventory Management System with Email Notification for Cornerblock Trading Inc.**

A web app for tracking the raw materials a furniture workshop uses: wood, plywood, metal, foam, leatherette and adhesives. Staff log what comes in and what goes out, managers see costs, suppliers and reports, and low-stock alerts arrive by email on everyone's phone.

It runs entirely on Google's free tiers: Firebase Authentication, Cloud Firestore and Firebase Hosting, with a Google Apps Script sending the email. There is no server to maintain and nothing to pay for.

This replaces an earlier LAN-based version built in PHP and MySQL on XAMPP. That version is kept in `legacy-php/` for reference, and the commit tagged `v1-lan-php` is the version as originally submitted.

> **Status:** migration in progress. This README covers what has been built and configured so far. Hosting, installing the app on the company desktop, the data migration, the free tier limits and the full acceptance checklist are added in step 12.

## What is in this repository

| Path | What it is |
|---|---|
| `app-firebase/` | The web app: Vite, plain JavaScript and Bootstrap 5, with the original Cornerblock stylesheet unchanged. |
| `apps-script/` | The email alert service. It has its own [setup guide](apps-script/README.md). |
| `firestore.rules` | The access rules. These, not the interface, are what decide who may read or change what. |
| `firestore.indexes.json` | The database indexes the app's filters need. |
| `tests/` | Unit, security rules and end-to-end tests. |
| `tools/` | Development helpers. |
| `legacy-php/` | The original LAN version, for reference only. |

## Running it locally

You need Node.js 20 or later, and Java 11 or later for the Firebase emulators.

```
npm install
npm run dev
```

This opens the app at http://localhost:5173, connected to the live Firebase project.

To work against local emulators instead, so that nothing touches real data:

1. In one terminal, start the emulators:

   ```
   npm run dev:emulators
   ```

2. Create a file called `.env.local` at the root of the repository containing:

   ```
   VITE_USE_EMULATORS=true
   ```

3. Run `npm run dev` in a second terminal.

## Tests

```
npm test
```

This runs three suites, which can also be run on their own:

| Command | What it checks | Needs |
|---|---|---|
| `npm run test:unit` | Stock rules, filters, reports, exports, the router, and the Apps Script alert rules run outside Apps Script | Nothing |
| `npm run test:rules` | `firestore.rules`: who may read and write what | Java, for the emulator |
| `npm run test:integration` | The app's own code against the Auth and Firestore emulators, with the real rules | Java, for the emulators |

## Firebase project setup

The project already exists. These are the settings it was created with, for reference or for setting up a copy.

| Setting | Value |
|---|---|
| Project ID | `cornerblock-inventory` |
| Project number | `281463397004` |
| Plan | Spark (free), no billing account |
| Firestore | Standard edition, `(default)` database, `asia-southeast1` (Singapore), production mode |
| Authentication | Email/Password and Google sign-in enabled |
| Web app | `cornerblock-web` |

The web app's configuration is in `app-firebase/src/lib/config.js`. It is safe to commit: it only identifies the project, and what anyone may do is decided by `firestore.rules`.

### Deploying the rules and indexes

```
npx firebase login
npm run deploy:rules
```

The second command deploys `firestore.rules` and `firestore.indexes.json`. A new index takes a few minutes to build after it is deployed. Until it finishes, a page that needs it shows "This page needs a database index that is still being built". You can check progress at https://console.firebase.google.com/project/cornerblock-inventory/firestore/indexes

## Accounts and roles

Nobody's account is created for them. Each person registers themselves with Google or with an email and password, and starts as **pending production staff** who can see nothing until a manager approves them on the **Users** page.

| Role | Can do |
|---|---|
| Production staff | Log stock in and out, view the catalog and movement history, add materials. Never sees cost, supplier, reports, settings or the audit trail. |
| General manager | Everything staff can, plus costs and suppliers, editing and archiving materials, stock adjustments, the dashboard and reports, approving and disabling accounts, and the audit trail. |
| Webmaster | Everything a manager can, plus granting and removing the manager role. Nobody can edit the webmaster's account. |

The webmaster is whoever signs in with the verified address `tedcmartinez2@gmail.com`. This is the only identity written into the system, and only as an email address, never a password. It appears in two places that must always match: `WEBMASTER_EMAIL` in `app-firebase/src/lib/config.js`, and `isWebmaster()` in `firestore.rules`.

## Google sign-in and the consent screen

The OAuth consent screen is at https://console.cloud.google.com/auth/overview?project=cornerblock-inventory

| Setting | Value |
|---|---|
| App name | Cornerblock Inventory |
| User support email | `tedcmartinez2@gmail.com` |
| Audience | **External**, publishing status **In production** |
| Scopes added | `https://www.googleapis.com/auth/drive.file` |

**Why In production rather than Testing.** While a consent screen is in Testing, Google sign-in for the whole project is limited to the people on its list of test users. Anyone else trying to sign in with Google is turned away at Google's own screen, before reaching the app. That would break self-registration, since a new employee could never sign in to register. In production, anyone with a Google account can sign in, and the system's own approval step decides what they can see.

**Why no Google verification is needed.** The only extra scope is `drive.file`, which Google classes as non-sensitive. It lets the system create files in a manager's Google Drive and see only the files it created itself, nothing else in their Drive. An app that asks only for non-sensitive scopes can be in production without going through Google's verification review.

`drive.file` is not requested at sign-in. It is asked for only when a manager presses **Export to Google Sheets** on the Audit Trail page, so people who never export are never asked for Drive access.

## Exporting the audit trail to Google Sheets

The **Google Sheets API** is enabled for the project: https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=cornerblock-inventory

A manager who signed in with Google can export the audit trail straight to a new spreadsheet in their own Drive. The export contains every entry matching the filters on screen, not just the current page. Each export is itself recorded in the audit trail.

A manager who signed in with an email and password, or who declines Drive access, is offered a CSV download instead.

## Email alerts

Low-stock and stock-out alerts and the reorder checklist are sent by a Google Apps Script, not by the app. The app never holds an email password. Setting it up is covered in [apps-script/README.md](apps-script/README.md).

Until the script is connected, the app records stock movements as normal and says plainly that no alert was sent.

## Still to be documented

Added in step 12 of the migration:

- Deploying to Firebase Hosting
- Installing the app on the company desktop as a standalone window
- Migrating the data from the LAN version's MySQL database
- What the free tier allows, and what happens when a limit is reached
- The full acceptance checklist, including the manual checks
