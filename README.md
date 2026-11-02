# Cornerblock Inventory

**Cloud-Based Materials Inventory Management System with Email Notification for Cornerblock Trading Inc.**

**Live:** https://cornerblock-inventory.web.app

A web app for tracking the raw materials a furniture workshop uses: wood, plywood, metal, foam, leatherette and adhesives. Staff log what comes in and what goes out, managers see costs, suppliers and reports, and low-stock alerts arrive by email.

It runs entirely on Google's free tiers: Firebase Authentication, Cloud Firestore and Firebase Hosting, with a Google Apps Script sending the email. There is no server to maintain and nothing to pay for.

**The app is for the company desktop.** It is used in Chrome or Edge on a computer, installed as its own window. Phones are not a target for the app itself: they receive the alert and checklist emails, which are designed for the Gmail app.

This replaces an earlier LAN-based version built in PHP and MySQL on XAMPP. That version is kept in `legacy-php/` for reference, and the commit tagged `v1-lan-php` is the version as originally submitted. Notes for the capstone write-up are in [docs/CAPSTONE_NOTES.md](docs/CAPSTONE_NOTES.md).

## Contents

- [What is in this repository](#what-is-in-this-repository)
- [Firebase project setup](#firebase-project-setup)
- [Email alerts: the Apps Script](#email-alerts-the-apps-script)
- [Deploying to Firebase Hosting](#deploying-to-firebase-hosting)
- [Installing the app on the company desktop](#installing-the-app-on-the-company-desktop)
- [Free tier limits](#free-tier-limits)
- [Accounts and roles](#accounts-and-roles)
- [Running it locally](#running-it-locally)
- [Running the tests](#running-the-tests)
- [Acceptance checklist](#acceptance-checklist)
- [Moving the data across from the LAN version](#moving-the-data-across-from-the-lan-version)

## What is in this repository

| Path | What it is |
|---|---|
| `app-firebase/` | The web app: Vite, plain JavaScript and Bootstrap 5, with the original Cornerblock stylesheet unchanged. |
| `apps-script/` | The email alert service. It has its own [setup guide](apps-script/README.md). |
| `firestore.rules` | The access rules. These, not the interface, decide who may read or change what. |
| `firestore.indexes.json` | The database indexes the app's filters need. |
| `firebase.json` | Hosting and emulator settings. |
| `tests/` | Unit, security rules and end-to-end tests. |
| `tools/migrate/` | The one-off data migration from the LAN version. It has its own [guide](tools/migrate/README.md). |
| `tools/` | Development helpers: the icon generator and the service worker's file list. |
| `docs/` | Notes for the capstone manuscript. |
| `legacy-php/` | The original LAN version, for reference only. |

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
| Hosting | `cornerblock-inventory.web.app` |
| Google Sheets API | Enabled, for the Movement History and report exports |

The web app's configuration is in `app-firebase/src/lib/config.js`. It is safe to commit: it only identifies the project, and what anyone may do is decided by `firestore.rules`. No password, app password or service-account key is in this repository.

### Deploying the rules and indexes

```
npx firebase login
npm run deploy:rules
```

The second command deploys `firestore.rules` and `firestore.indexes.json`. A new index takes a few minutes to build. Until it finishes, a page that needs it shows "This page needs a database index that is still being built". Progress is at https://console.firebase.google.com/project/cornerblock-inventory/firestore/indexes

### Google sign-in and the consent screen

The OAuth consent screen is at https://console.cloud.google.com/auth/overview?project=cornerblock-inventory

| Setting | Value |
|---|---|
| App name | Cornerblock Inventory |
| User support email | `tedcmartinez2@gmail.com` |
| Audience | **External**, publishing status **In production** |
| Scopes added | `https://www.googleapis.com/auth/drive.file` |

**Why In production rather than Testing.** While a consent screen is in Testing, Google sign-in is limited to the people on its list of test users. Anyone else is turned away at Google's own screen, so a new employee could never sign in to register. In production, anyone with a Google account can sign in, and the system's own approval step decides what they see.

**Why no Google verification is needed.** The only extra scope is `drive.file`, which Google classes as non-sensitive. It lets the system create files in a manager's Drive and see only the files it created. An app that asks only for non-sensitive scopes can be in production without Google's verification review.

`drive.file` is not requested at sign-in. It is asked for only when a manager presses **Export to Google Sheets** on Movement History or one of the four reports. A manager who signed in with a password, or who declines, is offered a CSV file instead.

## Email alerts: the Apps Script

Low-stock and stock-out alerts and the reorder checklist are sent by a Google Apps Script owned by `cornerblock.alerts@gmail.com`, not by the app. The app never holds an email password.

Setting it up, step by step, is in [apps-script/README.md](apps-script/README.md). In short:

1. Give `cornerblock.alerts@gmail.com` the **Cloud Datastore User** role on the project.
2. Create the script at https://script.google.com as that account, with this repository's `Code.gs` and `appsscript.json`.
3. Deploy it as a web app: **Execute as: Me**, **Who has access: Anyone**.
4. Put its `/exec` URL in `APPS_SCRIPT_URL` in `app-firebase/src/lib/config.js`, then redeploy Hosting.
5. Open **Settings** as a manager. **Email Alerts** should show **Working**.

To change the script later, paste the new `Code.gs` and use **Manage deployments**, then **New version**, so the URL stays the same.

## Deploying to Firebase Hosting

```
npx firebase login
npm run deploy:hosting
```

This builds the app into `dist/` and uploads it. The new version is live within a minute at https://cornerblock-inventory.web.app

- Every page address is served with `no-cache`, so the next load after a deploy gets the new version.
- Built scripts, stylesheets and fonts (everything in `/assets/`) are named after their contents and cached for a year, which is safe because a changed file gets a new name. This is why the stylesheets live in `app-firebase/src/css/` rather than `public/`: with fixed names, a browser could show the new scripts with the old styles for up to an hour.
- The few files that keep the same name (icons, the manifest, Bootstrap's script) are served with `no-cache`, and the service worker fetches them from the network first, keeping its saved copy for offline use.
- The installed app's service worker notices the new version on its next start and replaces its saved copy of the files.
- Source maps are built for local debugging but never uploaded.

If the rules or indexes changed too, run `npm run deploy:rules` as well. `npm run deploy` does all of it at once.

## Installing the app on the company desktop

The app is a Progressive Web App: Chrome and Edge can install it as its own window, with its own icon on the desktop and taskbar, and no address bar.

1. On the company desktop, open https://cornerblock-inventory.web.app in **Chrome** or **Edge**.
2. Sign in once.
3. Click the **install** icon at the right end of the address bar (a small monitor with a down arrow). In Edge it may be under **...**, then **Apps**, then **Install this site as an app**.
4. Click **Install**.

The app now opens from the Start menu or desktop shortcut in its own window. To pin it, right-click its taskbar icon and choose **Pin to taskbar**.

**When the internet drops:** the installed app keeps a copy of its own files, so the window still opens. Stock In and Stock Out can still be entered; they are saved on the computer and sent when the connection returns. A red bar appears on every page if the server later refuses one, naming the entry so it can be entered again. Adjustments, account changes and exports need a connection.

## Free tier limits

Everything runs on free plans. These are the limits that matter for a shop this size, with what happens when one is reached. Google publishes the current figures at https://firebase.google.com/pricing and https://developers.google.com/apps-script/guides/services/quotas

| Service | Free limit | What happens at the limit |
|---|---|---|
| Firestore reads | 50,000 per day | Pages stop loading new data until the daily reset (midnight Pacific time, 3 or 4 PM in Manila). A normal day uses a small fraction of this. Movement History reads at most 1,000 movements per page when a filter is checked in the browser, and exports stop at 10,000 rows, so no single click can use up the day. |
| Firestore writes | 20,000 per day | New entries are refused until the reset. Each stock movement is about four writes. |
| Firestore storage | 1 GiB | Years of history for this catalog. Receipt photos are compressed to at most 300 KB each, so this is the one that grows; roughly 3,000 receipts fit. |
| Authentication | No practical limit for email and Google sign-in | |
| Hosting | 10 GB stored, 360 MB transferred per day | The app is under 2 MB, so this is not a concern. |
| Apps Script email | About **100 recipients per day** for a free Gmail account | Every person on every email counts: a low-stock alert to five people uses five. When the day's allowance is spent, alerts are logged as failed and the next stock-out after the reset tries again. Settings shows how many are left today. |
| Apps Script calls | 20,000 outside calls per day, 30 calls per user per 10 minutes (the script's own limit) | |
| Sheets API | 300 requests per minute | An export uses three or four, so this is never reached. |

## Accounts and roles

Nobody's account is created for them. Each person registers with Google or with an email and password, and starts as **pending production staff**. They see a **Request sent** screen until a manager approves them on the **Users** page, and the app then opens by itself, with no reload.

People who register with an email and password are sent a verification link. The Users page shows **Verified** or **Unverified**, and approving an unverified account asks for confirmation first.

| | Production staff | General manager | Webmaster |
|---|:---:|:---:|:---:|
| Log stock in and out | ✓ | ✓ | ✓ |
| View the catalog and movement history | ✓ | ✓ | ✓ |
| Add materials | ✓ | ✓ | ✓ |
| Edit and archive materials, manage suppliers | | ✓ | ✓ |
| Adjust stock to a counted figure | | ✓ | ✓ |
| See cost and supplier | | ✓ | ✓ |
| Dashboard, reports, reorder checklist | | ✓ | ✓ |
| Export Movement History and the reports to Google Sheets | | ✓ | ✓ |
| Audit trail and its CSV download | | ✓ | ✓ |
| Approve, reject, disable and re-enable accounts | | ✓ | ✓ |
| Demote a manager to staff | | ✓ | ✓ |
| Delete a disabled account | | ✓ | ✓ |
| Promote staff to manager | | | ✓ |

Rules that apply to everyone, the webmaster included:

- Nobody can change their own role or status, or delete their own account.
- Nobody can change or delete the webmaster's account.
- A role changes only on an active account. A disabled account can only be re-enabled or deleted.

Only the webmaster can make someone a manager. That keeps the shop from being locked out: if every manager were removed, the webmaster could still appoint one.

The webmaster is whoever signs in with the verified address `tedcmartinez2@gmail.com`. This is the only identity written into the system, and only as an email address. It appears in two places that must always match: `WEBMASTER_EMAIL` in `app-firebase/src/lib/config.js`, and `isWebmaster()` in `firestore.rules`.

### Deleting an account

A disabled account can be deleted from the **Disabled** tab of the Users page. Deleting removes the person's `users` record, with a `user.delete` entry in the audit trail. Their stock movements, receipts and audit entries are kept, and still show the name saved on them.

**The Firebase sign-in is not deleted.** The free Spark plan has no Cloud Functions, and removing a sign-in needs the Admin SDK, so the app cannot do it from the browser. Until the sign-in is removed, the person can still sign in, and arrives as a new pending request that a manager can reject. To remove it completely:

1. Open https://console.firebase.google.com/project/cornerblock-inventory/authentication/users
2. Find the person's email address.
3. Click the **...** at the end of the row and choose **Delete account**.

## Running it locally

You need Node.js 20 or later, and Java 11 or later for the Firebase emulators.

```
npm install
npm run dev
```

This opens the app at http://localhost:5173, connected to the live Firebase project. The service worker is switched off in development, so edits always show.

To work against local emulators instead, so that nothing touches real data:

1. In one terminal, run `npm run dev:emulators`.
2. Create a file called `.env.local` at the root of the repository containing `VITE_USE_EMULATORS=true`.
3. Run `npm run dev` in a second terminal.

## Running the tests

```
npm test
```

This runs three suites, which can also be run on their own:

| Command | What it checks | Needs |
|---|---|---|
| `npm run test:unit` | Stock rules, form requirements, filters, date ranges, reports, exports, the router, account permissions, and the Apps Script alert rules run outside Apps Script | Nothing |
| `npm run test:rules` | `firestore.rules`: who may read and write what, the audit trail, receipts, projects, deletes | Java, for the emulator |
| `npm run test:integration` | The app's own code against the Auth and Firestore emulators with the real rules: registration and approval, live account changes, stock movements including offline ones, the audit trail, filters and the migration | Java, for the emulators |

At the last run: 378 unit, 97 rules and 117 integration tests, all passing.

## Acceptance checklist

Tests 1 to 12 are proved automatically by `npm run test:rules` and `npm run test:integration`. The rest are checked by hand on the live system.

| # | Check | How |
|---|---|---|
| 1 | Register with email and password: pending production staff, cannot read materials, sees **Request sent** | Automated |
| 2 | The same with Google sign-in | Automated |
| 3 | `tedcmartinez2@gmail.com` with a verified Google sign-in becomes the active webmaster | Automated |
| 4 | An unverified or look-alike address never becomes webmaster | Automated |
| 5 | A manager approves a user, who can then stock in and out, and the waiting screen opens the app by itself | Automated, and by hand in two windows |
| 6 | Staff reading `material_costs` or `suppliers` is denied; staff see no cost or supplier columns | Automated |
| 7 | Staff editing a material's name or threshold is denied | Automated |
| 8 | A manager granting `general_manager` is denied; the webmaster can | Automated |
| 9 | Anyone editing, disabling or deleting the webmaster's account is denied | Automated |
| 10 | A data write without a new audit entry, or with a reused one, is denied | Automated |
| 11 | Changing or deleting an audit entry is denied for everyone | Automated |
| 12 | A stock-out larger than the stock on hand is blocked | Automated |
| 13 | A stock-out reaching the threshold sends one low-stock email; another within 24 hours sends none; reaching zero sends a stock-out email to the manager | By hand |
| 14 | The alert and checklist emails display correctly in the Gmail app on a phone | By hand |
| 15 | Movement History and each report, Export to Google Sheets: a spreadsheet in the manager's Drive with the filtered rows, and `movements.export` or `reports.export` in the audit trail | By hand |
| 16 | A manager signed in with a password is offered a CSV file instead | By hand |
| 17 | The internet drops during a stock-in: it syncs when the connection returns, with its audit entry | By hand |
| 18 | The app installs from Chrome or Edge on the desktop and opens in its own window | By hand |
| 19 | A receipt photo is required on every stock-in, saves and can be viewed; a large image is compressed to 300 KB or less | By hand |
| 20 | No passwords, app passwords or service-account keys anywhere in the repository or its history | Searched before the merge to `main` |

## Moving the data across from the LAN version

Suppliers, materials and stock movements were copied from the old MySQL database by the scripts in `tools/migrate/`, once, on the day the shop switched over: 18 suppliers and 52 materials, checked field by field afterwards. User accounts were not carried across; everyone registers again. The steps are in [tools/migrate/README.md](tools/migrate/README.md).
