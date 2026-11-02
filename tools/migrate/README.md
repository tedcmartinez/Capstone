# Migrating the data from the LAN version

Moves the suppliers, materials and stock movements out of the LAN version's MySQL database and into Firestore. It runs once, on the day the shop switches over.

User accounts are **not** migrated. Everyone registers again in the new system and is approved by the manager, so no password, password hash or email address is carried across.

## How it works

Four steps, each a separate command, so the risky part, writing to the live database, comes only after the data has been read, checked and rehearsed.

| Step | Command | What it does | Touches Firestore? |
|---|---|---|---|
| 1 | `npm run migrate:dump` | Exports the three tables from MySQL, plus a list of user names | No |
| 2 | `npm run migrate:convert` | Works out exactly what will be written, into a plan file you can read | No |
| 3 | `npm run migrate:import` | Writes the plan to Firestore. A dry run unless you add `--commit` | Yes, with `--commit` |
| 4 | `npm run migrate:verify` | Reads every imported document back and compares it with the plan | Reads only |

Everything the steps write goes into `tools/migrate/input/` and `tools/migrate/output/`. Both folders are excluded from version control: they hold the client's real catalog.

## What changes on the way across

| LAN version | New system | Why |
|---|---|---|
| One `materials` row with cost and supplier | A `materials` document and a separate `material_costs` document | Firestore cannot hide one field of a document from production staff, so cost and supplier live where staff cannot read them |
| Integer ids | Ids built from the old ones, such as `legacy-material-12`, with the number kept in `legacyId` | Re-running the rehearsal gives the same ids, and any document can be traced back to its row |
| Reason, reference and notes joined in one column, e.g. `Purchase \| Ref: PO-1042 \| late` | Three fields: `reason`, `reference`, `notes` | The old system had nowhere else to put them. They are split using the same rules that joined them, and no text is lost |
| No stock figures recorded on a movement | `beforeQty` and `afterQty` on every movement | Worked out backwards from each material's current stock. The history labels them as "worked out from the LAN records" |
| A date, no time | A time of day added, in the order movements were entered | So same-day movements stay in the right order |
| Who logged it, by user id | `loggedByName`, the person's name | Accounts are not migrated, but the history still shows who did it |
| Receipt images as files on the PC | Compressed into Firestore, exactly as a new upload is | Same limits as the upload form: 1280 pixels, JPEG, 300 KB |

Each material's current stock figure is imported as it is. The old movements are history and are **not** applied again, since the current figure already includes them.

Every imported document points at a `data.migrate` entry in the audit trail. That keeps the rule the rest of the system lives by: nothing exists without an entry explaining where it came from. One further entry records the run as a whole.

## What the current database holds

At the last check, the LAN database held 18 suppliers and 52 materials, every one with a cost and a supplier, and **no stock movements**. The two receipt images in `legacy-php/public/uploads/receipts/` are not attached to any movement, so the import lists them and leaves them out. A receipt in the new system belongs to a movement, and these have none to belong to.

The movement and receipt parts of the migration are tested with synthetic data in `tests/unit/migration.test.js` and `tests/integration/migration.test.js`, so they are ready if movements are recorded in the LAN version before the switch.

## On the day

### Before you start

- **Stop using the LAN version.** Anything recorded in it after the dump will not be carried across.
- Start **MySQL** from the XAMPP Control Panel.
- Make sure the new system has **not** been used for real yet. The import refuses to write into a database that already has materials, suppliers or movements, so that a second run can never put the old stock figures back over the real ones.

### 1. Export

```
npm run migrate:dump
```

The `users` table is not dumped at all. Only each user's id and name are exported, so that movements can still say who logged them.

If MySQL has a password or is not in `C:\xampp\mysql\bin`, set `MYSQL_PWD` or `MYSQL_BIN` first. They are described at the top of `dump.mjs`.

### 2. Convert and read the result

```
npm run migrate:convert
```

This prints a summary and any warnings, and writes `tools/migrate/output/plan.json`. **Read the warnings.** Each says what was found and what will happen to it. The most important is "the recorded movements of material N do not add up". It means the old figures cannot be reconciled, usually because a quantity was changed outside a movement. Those movements are still imported as recorded, and the material should be checked with a stock adjustment once the new system is running.

### 3. Rehearse against the emulator

In one terminal:

```
npm run dev:emulators
```

In another:

```
npm run migrate:import -- --target emulator --commit
npm run migrate:verify -- --target emulator
```

Verify should end with **Everything matches the plan.** You can also open the app against the emulator, as described in the main README, and look through the imported catalog.

To rehearse again, stop and restart the emulators, which clears them.

### 4. Get a service account key

The import writes with the Firebase Admin SDK, which needs a key file for the project. Treat it like a password: it gives full access to the database.

1. Open https://console.firebase.google.com/project/cornerblock-inventory/settings/serviceaccounts/adminsdk
2. Click **Generate new private key**, then **Generate key**.
3. Save the file **outside this repository**, for example in `C:\Users\63929\secrets\`. The import refuses a key file stored anywhere inside the repository.

### 5. Import into the live project

First a dry run, which connects and checks but writes nothing:

```
npm run migrate:import -- --target live --key C:\Users\63929\secrets\cornerblock-admin.json
```

Then the real import. `--confirm` with the project id is required as a deliberate second step, so the rehearsal command can never write to the live project by having its target changed alone:

```
npm run migrate:import -- --target live --key C:\Users\63929\secrets\cornerblock-admin.json --commit --confirm cornerblock-inventory
```

Then check it:

```
npm run migrate:verify -- --target live --key C:\Users\63929\secrets\cornerblock-admin.json
```

### 6. Clean up

1. **Revoke the key.** Deleting the file is not enough, since a copy could exist. Open https://console.cloud.google.com/iam-admin/serviceaccounts?project=cornerblock-inventory, open the `firebase-adminsdk` account, go to **Keys**, and delete the key you created. The file is useless from then on.
2. Delete the key file.
3. Delete everything in `tools/migrate/input/` and `tools/migrate/output/` except `.gitkeep`. The dump and the plan are the client's catalog, and they are no longer needed.

## What it costs

On the free plan, Firestore allows 20,000 document writes a day. The current catalog is 18 suppliers, 52 materials and 52 cost records, plus one audit entry for each supplier and material and one for the run: 193 writes. Verify reads each of them back once.
