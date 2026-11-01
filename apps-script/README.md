# Cornerblock Inventory alert service

The Google Apps Script that sends the low-stock and stock-out alert emails and the reorder checklist. It replaces PHPMailer and the Gmail App Password the LAN version kept in `config/email.config.php`. It holds no password at all: it runs as its owner, `cornerblock.alerts@gmail.com`, and sends mail as that account.

| File | What it is |
|---|---|
| `Code.gs` | The script. Its alert rules are tested in `tests/unit/apps-script.test.js`, which runs this exact file in Node with stand-ins for the Google services. |
| `appsscript.json` | The manifest: the permissions the script asks for, and how it is deployed. |

## What it does

The app calls it with one of three actions, always sending the caller's Firebase ID token:

- **`checkStock`** runs after every stock-out. The script checks the token with Google, confirms the caller is an active user, reads the material from Firestore itself, and sends whatever alerts are due. It ignores any figures in the request, so a tampered browser cannot fake an alert or suppress one.
- **`sendChecklist`** is manager only. The script builds the low-stock list from Firestore and emails it to the chosen accounts, plus at most one outside address.
- **`ping`** is manager only. The Settings page uses it to show whether the service is working, which account sends the mail, and how many emails are left today.

The alert rules are the ones the LAN version used:

| Alert | When | Goes to |
|---|---|---|
| Low stock | Stock at or below the material's threshold | Active production staff and general managers |
| Stock-out | Stock reaches zero | Active general managers only |
| Repeat protection | The same alert for the same material is not resent within 24 hours | |

A material that runs out raises both alerts. Every attempt is written to `notification_log`, which is how the 24 hour rule is checked. Only a successful send counts towards it, so a failed one does not block the next try.

The webmaster account receives neither alert. The role did not exist in the LAN version, and it belongs to the developer rather than to someone at the shop. To copy the webmaster in during the pilot, add `'webmaster'` to the role lists in `alertRecipients()` in `Code.gs`.

Each caller is limited to 30 requests per 10 minutes, so a stuck page cannot use up the day's mail allowance.

## Setting it up

Steps 1 and 2 are done by the project owner, `tedcmartinez2@gmail.com`. The rest are done signed in as **`cornerblock.alerts@gmail.com`**.

### 1. Give the alert account access to Firestore

The script reads and writes Firestore with its owner's own Google permissions, not through `firestore.rules`. That is how it can write `notification_log`, which no browser can.

1. Open **IAM** for the project: https://console.cloud.google.com/iam-admin/iam?project=cornerblock-inventory
2. Click **Grant access**.
3. Under **New principals**, enter `cornerblock.alerts@gmail.com`.
4. Add the role **Cloud Datastore User**. This lets it read and write Firestore documents, and nothing else.
5. Add a second role, **Browser**. This only lets the account see that the project exists, which step 4 needs. It grants no access to any data.
6. Click **Save**. A new role can take a few minutes to take effect.

### 2. Check the web API key is not limited to websites

The script checks each caller's sign-in with Google using the project's web API key. If that key has been restricted to certain websites, Google refuses the check, because the request comes from Google's servers rather than a browser.

Open https://console.cloud.google.com/apis/credentials?project=cornerblock-inventory and check the **Browser key (auto created by Firebase)**. Under **Application restrictions**, it should say **None**. That is the Firebase default. If someone has set it to **Websites**, see Troubleshooting below.

### 3. Create the script

1. Sign in to https://script.google.com as `cornerblock.alerts@gmail.com`.
2. Click **New project** and rename it `Cornerblock Inventory Alerts`.
3. Open **Project Settings** (the gear icon) and tick **Show "appsscript.json" manifest file in editor**.
4. Back in **Editor**, open `appsscript.json` and replace its contents with this folder's `appsscript.json`.
5. Open `Code.gs` and replace its contents with this folder's `Code.gs`.
6. Save.

### 4. Link the script to the Firebase project, only if needed

Skip this step at first. Deploy (step 5), connect the app (step 6), then open **Settings**. Come back here only if Settings says **the Firestore API is not enabled for the Google Cloud project this script runs in**.

By default a script runs in a hidden Google Cloud project that Google creates for it. Whether its Firestore requests then work depends on how Google attributes them, which is why this is checked rather than assumed. If they do not, linking the script to the Firebase project makes its requests in the project where Firestore actually is.

1. In **Project Settings**, under **Google Cloud Platform (GCP) Project**, click **Change project**.
2. Enter the project **number** `281463397004`. This is the project number, not the ID `cornerblock-inventory`.
3. Click **Set project**.
4. Approve the script's permissions again: open the editor, choose any function, and click **Run**. Linking changes the OAuth client the script runs under, so the earlier approval no longer applies.
5. Click **Deploy**, then **Manage deployments**, the pencil icon, choose **New version**, and **Deploy**. The URL stays the same, so `config.js` does not change.

If step 3 is refused for permissions, the **Browser** role from step 1 has not taken effect yet. Wait a few minutes and try again.

**If you never need this step, remove the Browser role** from `cornerblock.alerts@gmail.com`. It exists only so the account can see the project when linking, and an account should hold no access it does not use.

### 5. Deploy it

1. Click **Deploy**, then **New deployment**.
2. Next to **Select type**, click the gear and choose **Web app**.
3. **Description:** `Cornerblock alerts`
4. **Execute as:** **Me (cornerblock.alerts@gmail.com)**
5. **Who has access:** **Anyone**

   It must be **Anyone**, not **Anyone with Google account**. The app calls the script directly from the browser, without a Google login cookie. Each request carries a Firebase ID token, which the script checks itself.

6. Click **Deploy**. Google asks the account to authorise what the script does: send email, connect to external services, read and write Firestore, and see its own email address.

   Google will show **Google hasn't verified this app**. That is expected: this is the account authorising its own script. Click **Advanced**, then **Go to Cornerblock Inventory Alerts (unsafe)**, then **Allow**.

7. Copy the **Web app URL**. It ends in `/exec`.

### 6. Connect the app to it

1. Open `app-firebase/src/lib/config.js` and paste the URL into `APPS_SCRIPT_URL`:

   ```js
   export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfy.../exec';
   ```

   The URL is safe to commit. It is only an address, and the script refuses anyone who is not signed in as an active user.

2. Rebuild, or restart `npm run dev`, and redeploy Hosting when it is live.

### 7. Check it works

As a manager, open **Settings** in the app. **Email Alerts** should show **Working**, with `cornerblock.alerts@gmail.com` as the sender and the number of emails left today.

Then run acceptance test 13: take a material's stock down to its threshold with a Stock Out. Each active staff member and manager should receive one **Low-Stock Alert**. Another Stock Out within 24 hours sends nothing. Take it to zero and the manager receives a **Stock-Out Alert**.

## Updating the script later

Paste the new `Code.gs` into the editor, then click **Deploy**, then **Manage deployments**, the pencil icon, and choose **New version** under **Version**. Click **Deploy**.

This keeps the same URL, so `config.js` does not change. Choosing **New deployment** instead would create a second URL.

## Using the command line instead

`clasp`, Google's command-line tool for Apps Script, can replace the copy and paste in step 3 and the deployment in step 5. Steps 1, 2 and 4 must still be done in the console.

1. Signed in as `cornerblock.alerts@gmail.com`, turn on the Apps Script API at https://script.google.com/home/usersettings
2. In this repository:

   ```
   npx @google/clasp login
   npx @google/clasp create --type webapp --title "Cornerblock Inventory Alerts" --rootDir apps-script
   npx @google/clasp push
   npx @google/clasp deploy --description "Cornerblock alerts"
   ```

   `clasp login` opens a browser. Sign in there as `cornerblock.alerts@gmail.com`, not as the project owner. `clasp create` writes a `.clasp.json` holding the script's id, which is not a secret.

3. Do step 4, then open the script in the editor once and run any function. This brings up the same authorisation screen as step 5.

## How much mail it can send

A free Gmail account can send to about **100 recipients a day** through Apps Script. Every person on every email counts. A low-stock alert to five people uses five, and a checklist to three people uses three. The allowance resets each day, and the Settings page shows Google's own count of what is left.

When the allowance runs out, alerts are recorded in `notification_log` as `failed` rather than lost, and the next stock-out after the reset tries again.

## Troubleshooting

The Settings page shows the script's own explanation when something is wrong.

| Settings says | What to do |
|---|---|
| **does not have permission to use Firestore** | Step 1 is missing, or the role has not taken effect yet. Check the IAM page lists `cornerblock.alerts@gmail.com` with **Cloud Datastore User**, then wait a few minutes. |
| **the Firestore API is not enabled for the Google Cloud project this script runs in** | Step 4 is missing. Link the script to project number `281463397004`. |
| **Your sign-in has expired** on every request, even straight after signing in | The web API key is restricted to websites (step 2). Either set its **Application restrictions** to **None**, or create a second, unrestricted key and put it in `FIREBASE_API_KEY` at the top of `Code.gs`. |
| **Unreachable** | Check the internet connection. If the connection is fine, check the deployment's **Who has access** is **Anyone**, and that `APPS_SCRIPT_URL` ends in `/exec`, not `/dev`. |
| **Not Set Up** | `APPS_SCRIPT_URL` in `config.js` is still empty (step 6). |
