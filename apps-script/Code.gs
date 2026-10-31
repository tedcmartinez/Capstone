// ============================================================
// Cornerblock Inventory: email alerts and the reorder checklist
//
// A Google Apps Script web app, owned by cornerblock.alerts@gmail.com and
// deployed to run as that account. It replaces core/Mailer.php,
// app/models/Notification.php and the sending half of ChecklistController.
//
// Why it exists: sending mail needs a credential, and anything the browser
// holds, every user of the browser holds. The LAN version kept a Gmail App
// Password in a config file on the office PC. This script needs no password
// at all: it runs as its owner, and MailApp sends as that account.
//
// It trusts nothing the browser says about stock. It is told which material
// to check and who is asking, verifies who is asking with Google, and reads
// the actual quantity from Firestore itself. A tampered browser cannot make
// it announce a stock-out that never happened, or suppress one that did.
//
// Reads and writes Firestore through the REST API with the owner's own OAuth
// token. That access comes from the owner's IAM role on the Firebase project
// (Cloud Datastore User), not from firestore.rules, which is why it can write
// notification_log when no browser can.
//
// Deployment steps are in apps-script/README.md.
// ============================================================

// ============================================================
// CONFIGURATION
// None of this is secret. The API key is the same public web key the app
// ships to every browser; it identifies the project and grants nothing.
// ============================================================

var CONFIG = {
  PROJECT_ID: 'cornerblock-inventory',
  FIREBASE_API_KEY: 'AIzaSyBNRjuhfQSCJEP06p9W4gvVEI10NssiZOM',

  // Must match WEBMASTER_EMAIL in app-firebase/src/lib/config.js and the
  // literal in firestore.rules
  WEBMASTER_EMAIL: 'tedcmartinez2@gmail.com',

  // Where the button in each email leads
  APP_URL: 'https://cornerblock-inventory.web.app',

  TIME_ZONE: 'Asia/Manila',
  SENDER_NAME: 'Cornerblock Inventory',

  // The same alert is not resent for the same material within this window,
  // the rule Notification::wasSentRecently() enforced
  DEDUPE_HOURS: 24,

  // Per signed-in user. Generous for real use, which is one call per
  // stock-out, and low enough that a stuck loop or a hostile script cannot
  // spend the account's daily mail allowance.
  RATE_LIMIT_CALLS: 30,
  RATE_LIMIT_WINDOW_SECONDS: 600,

  // The checklist may go to one address outside the system, such as a
  // supplier, as the LAN version allowed
  MAX_EXTRA_RECIPIENTS: 1,
};

var FIRESTORE_BASE =
  'https://firestore.googleapis.com/v1/projects/' + CONFIG.PROJECT_ID +
  '/databases/(default)/documents';

// ============================================================
// ENTRY POINT
// ============================================================

// Every request is a POST with a JSON body naming an action. The app sends
// it as text/plain, which a browser can send to another site without a CORS
// preflight. Apps Script web apps cannot answer a preflight, so this is the
// difference between the call working and not.
function doPost(e) {
  var request;
  try {
    request = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (parseError) {
    return respond({ ok: false, error: 'The request was not valid JSON.' });
  }

  try {
    switch (request.action) {
      case 'ping':
        return respond(handlePing(request));
      case 'checkStock':
        return respond(handleCheckStock(request));
      case 'sendChecklist':
        return respond(handleSendChecklist(request));
      default:
        return respond({ ok: false, error: 'Unknown action.' });
    }
  } catch (error) {
    // A refusal raised on purpose carries a message meant for the user.
    // Anything else is logged in full for the owner and summarised.
    if (error && error.isRefusal) {
      return respond({ ok: false, error: error.message, code: error.code });
    }
    console.error(error && error.stack ? error.stack : error);
    return respond({ ok: false, error: 'The alert service hit an unexpected problem.' });
  }
}

// A plain GET, such as somebody opening the URL in a browser, gets nothing
// but a sentence. It does not reveal anything about the system.
function doGet() {
  return ContentService.createTextOutput('Cornerblock Inventory alert service.');
}

function respond(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// An error the caller should see the message of
function refusal(message, code) {
  var error = new Error(message);
  error.isRefusal = true;
  error.code = code || 'refused';
  return error;
}

// ============================================================
// WHO IS ASKING
//
// Mirrors firestore.rules. The browser sends its Firebase ID token, which
// Identity Toolkit checks with Google: the signature, that it was issued for
// this project, and that it has not expired. The profile is then read from
// Firestore, so a disabled account is refused here as it is everywhere else.
// ============================================================

function verifyCaller(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw refusal('You must be signed in.', 'unauthenticated');
  }

  var lookup = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + CONFIG.FIREBASE_API_KEY,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true,
    }
  );

  if (lookup.getResponseCode() !== 200) {
    throw refusal('Your sign-in has expired. Sign out and back in, then try again.', 'unauthenticated');
  }

  var account = (JSON.parse(lookup.getContentText()).users || [])[0];
  if (!account || !account.localId) {
    throw refusal('Your sign-in could not be confirmed.', 'unauthenticated');
  }

  var profile = firestoreGet('users/' + account.localId);

  var caller = {
    uid: account.localId,
    email: account.email || '',
    emailVerified: account.emailVerified === true,
    name: profile ? profile.name : '',
    role: profile ? profile.role : null,
    status: profile ? profile.status : null,
  };

  // The webmaster is recognised by verified address, the same recovery path
  // the rules use, so the project stays administrable even if the profile
  // document were damaged
  caller.isWebmaster =
    caller.emailVerified && caller.email.toLowerCase() === CONFIG.WEBMASTER_EMAIL.toLowerCase();

  caller.isActive = caller.isWebmaster || caller.status === 'active';
  caller.isManager =
    caller.isWebmaster || (caller.isActive && caller.role === 'general_manager');

  if (!caller.isActive) {
    throw refusal('Your account is not active.', 'permission-denied');
  }

  return caller;
}

// ============================================================
// RATE LIMIT
//
// A fixed window per user: the first call opens a ten minute window, and
// within it at most thirty calls are answered. Kept in CacheService, which
// needs no setup and forgets on its own.
// ============================================================

function checkRateLimit(uid) {
  var cache = CacheService.getScriptCache();
  var key = 'rate:' + uid;
  var now = Date.now();

  var state = null;
  var stored = cache.get(key);
  if (stored) {
    try {
      state = JSON.parse(stored);
    } catch (ignored) {
      state = null;
    }
  }

  var windowMs = CONFIG.RATE_LIMIT_WINDOW_SECONDS * 1000;
  if (!state || now - state.start >= windowMs) {
    state = { start: now, count: 0 };
  }

  state.count += 1;

  if (state.count > CONFIG.RATE_LIMIT_CALLS) {
    throw refusal(
      'Too many requests in a short time. Wait a few minutes and try again.',
      'rate-limited'
    );
  }

  // The expiry is what is left of the window, so the window does not slide
  // forward with every call
  var remainingSeconds = Math.max(1, Math.ceil((state.start + windowMs - now) / 1000));
  cache.put(key, JSON.stringify(state), remainingSeconds);
}

// ============================================================
// ACTIONS
// ============================================================

// Used by the Settings page. Confirms the whole chain works end to end: the
// token is accepted, Firestore can be read with the owner's IAM role, and
// mail can be sent. A setup problem shows up here first, as a sentence,
// rather than as an alert that silently never arrives.
function handlePing(request) {
  var caller = verifyCaller(request.idToken);
  if (!caller.isManager) {
    throw refusal('Only a manager may check the alert service.', 'permission-denied');
  }
  checkRateLimit(caller.uid);

  return {
    ok: true,
    sender: Session.getEffectiveUser().getEmail(),
    quotaRemaining: MailApp.getRemainingDailyQuota(),
    firestore: 'reachable',
  };
}

// Called by the app after every stock-out.
function handleCheckStock(request) {
  var caller = verifyCaller(request.idToken);
  checkRateLimit(caller.uid);

  if (!request.materialId || typeof request.materialId !== 'string') {
    throw refusal('No material was named.', 'invalid-argument');
  }

  // Held while deciding and sending, so two stock-outs landing at the same
  // moment cannot both find nothing sent yet and both send the same alert
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    // Read from Firestore, never taken from the request
    var material = firestoreGet('materials/' + request.materialId);
    if (!material || material.isArchived) {
      return { ok: true, sent: [], skipped: [], recipients: 0 };
    }

    var due = alertsDue(material);
    var sent = [];
    var skipped = [];
    var recipientCount = 0;

    if (due.length === 0) {
      return { ok: true, sent: sent, skipped: skipped, recipients: 0 };
    }

    var activeUsers = loadActiveUsers();

    for (var i = 0; i < due.length; i++) {
      var trigger = due[i];

      if (wasSentRecently(request.materialId, trigger)) {
        skipped.push(trigger);
        continue;
      }

      var recipients = alertRecipients(activeUsers, trigger);
      if (recipients.length === 0) continue;

      var delivered = sendAlert(material, request.materialId, trigger, recipients);
      if (delivered > 0) sent.push(trigger);
      recipientCount += delivered;
    }

    return {
      ok: true,
      sent: sent,
      skipped: skipped,
      recipients: recipientCount,
    };
  } finally {
    lock.releaseLock();
  }
}

// Called from the Reorder Checklist page. Manager only, matching
// ChecklistController, which required general_manager for the whole class.
function handleSendChecklist(request) {
  var caller = verifyCaller(request.idToken);
  if (!caller.isManager) {
    throw refusal('Only a manager may send the reorder checklist.', 'permission-denied');
  }
  checkRateLimit(caller.uid);

  var addresses = checklistRecipients(request.recipientUids, request.extraEmail);
  if (addresses.length === 0) {
    throw refusal('Choose at least one recipient.', 'invalid-argument');
  }

  // The list is built here from Firestore, not taken from the request, so
  // what is emailed is what is actually low
  var materials = loadLowStock();
  if (materials.length === 0) {
    throw refusal('Nothing needs reordering right now, so there is no checklist to send.', 'failed-precondition');
  }

  var now = new Date();
  var subject = 'Reorder Checklist - ' + formatDate(now, 'MMMM d, yyyy');
  var html = checklistEmailHtml(materials, now);
  var text = checklistEmailText(materials, now);

  var sentTo = [];
  var failedTo = [];

  for (var i = 0; i < addresses.length; i++) {
    try {
      MailApp.sendEmail({
        to: addresses[i],
        subject: subject,
        htmlBody: html,
        body: text,
        name: CONFIG.SENDER_NAME,
      });
      sentTo.push(addresses[i]);
    } catch (sendError) {
      console.error('Checklist to ' + addresses[i] + ' failed: ' + sendError);
      failedTo.push(addresses[i]);
    }
  }

  return {
    ok: true,
    sent: sentTo.length,
    failed: failedTo.length,
    failedAddresses: failedTo,
    materialCount: materials.length,
  };
}

// ============================================================
// THE ALERT RULES
// Ported from Notification::checkAndNotify(). Kept as plain functions with
// no Google services in them, so they can be tested away from Apps Script.
// ============================================================

// Which alerts the material's current figures call for.
//
// Identical to the PHP: at or below the threshold is low stock, and nothing
// left is a stock-out as well. A material that hits zero therefore raises
// both, the low-stock one to everybody and the stock-out one to the manager,
// each subject to its own 24 hour window.
function alertsDue(material) {
  var quantity = Number(material.stockQuantity) || 0;
  var threshold = Number(material.minThreshold) || 0;
  var due = [];

  if (quantity <= threshold) due.push('low-stock');
  if (quantity === 0) due.push('stock-out');

  return due;
}

// Who receives which alert, as the LAN version decided it: low stock goes to
// active production staff and general managers, a stock-out to general
// managers only. The webmaster role did not exist then and is the developer
// rather than somebody at the shop, so it receives neither.
function alertRecipients(users, trigger) {
  var roles = trigger === 'stock-out'
    ? ['general_manager']
    : ['production_staff', 'general_manager'];

  var seen = {};
  var emails = [];

  for (var i = 0; i < users.length; i++) {
    var user = users[i];
    if (user.status !== 'active') continue;
    if (roles.indexOf(user.role) === -1) continue;
    if (!user.email) continue;

    var key = user.email.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    emails.push(user.email);
  }

  return emails;
}

// Whether the same alert went out for this material within the window.
// Only a successful send counts, so a failed attempt does not stop the
// next stock-out from trying again.
function wasSentRecently(materialId, trigger) {
  var since = new Date(Date.now() - CONFIG.DEDUPE_HOURS * 60 * 60 * 1000);

  // Uses the composite index on materialId, triggerType and timestamp. The
  // status is checked here rather than in the query, so no further index
  // is needed for it.
  var rows = firestoreQuery({
    from: [{ collectionId: 'notification_log' }],
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
          fieldFilter('materialId', 'EQUAL', { stringValue: materialId }),
          fieldFilter('triggerType', 'EQUAL', { stringValue: trigger }),
          fieldFilter('timestamp', 'GREATER_THAN_OR_EQUAL', { timestampValue: since.toISOString() }),
        ],
      },
    },
    orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
    limit: 50,
  });

  for (var i = 0; i < rows.length; i++) {
    if (rows[i].status === 'sent') return true;
  }
  return false;
}

// Sends one alert to each recipient separately, as the PHP did, so one bad
// address does not stop the others, and records every attempt. Returns how
// many were delivered.
function sendAlert(material, materialId, trigger, recipients) {
  var title = trigger === 'stock-out' ? 'Stock-Out Alert' : 'Low-Stock Alert';
  var subject = title + ': ' + material.name;
  var now = new Date();
  var html = alertEmailHtml(material, trigger, now);
  var text = alertEmailText(material, trigger, now);

  var delivered = 0;

  for (var i = 0; i < recipients.length; i++) {
    var status = 'sent';

    // MailApp refuses once the daily allowance is spent. Checked first so
    // the log says why, rather than recording a generic failure.
    if (MailApp.getRemainingDailyQuota() < 1) {
      status = 'failed';
    } else {
      try {
        MailApp.sendEmail({
          to: recipients[i],
          subject: subject,
          htmlBody: html,
          body: text,
          name: CONFIG.SENDER_NAME,
        });
      } catch (sendError) {
        console.error('Alert to ' + recipients[i] + ' failed: ' + sendError);
        status = 'failed';
      }
    }

    if (status === 'sent') delivered += 1;

    firestoreCreate('notification_log', {
      materialId: { stringValue: materialId },
      triggerType: { stringValue: trigger },
      channel: { stringValue: 'email' },
      recipientEmail: { stringValue: recipients[i] },
      status: { stringValue: status },
      timestamp: { timestampValue: new Date().toISOString() },
    });
  }

  return delivered;
}

// ============================================================
// THE CHECKLIST
// ============================================================

// The addresses for a checklist: the chosen accounts that are still active,
// and at most one address from outside the system
function checklistRecipients(recipientUids, extraEmail) {
  var addresses = [];
  var seen = {};

  function add(address) {
    var key = String(address).trim().toLowerCase();
    if (!key || seen[key]) return;
    seen[key] = true;
    addresses.push(String(address).trim());
  }

  var uids = Array.isArray(recipientUids) ? recipientUids : [];
  for (var i = 0; i < uids.length; i++) {
    if (typeof uids[i] !== 'string' || !uids[i]) continue;
    var user = firestoreGet('users/' + uids[i]);
    if (user && user.status === 'active' && user.email) add(user.email);
  }

  // A list is refused rather than trimmed, so a request carrying several
  // outside addresses is plainly wrong instead of quietly half-sent
  if (Array.isArray(extraEmail)) {
    if (extraEmail.length > CONFIG.MAX_EXTRA_RECIPIENTS) {
      throw refusal('Only one email address outside the system can be added.', 'invalid-argument');
    }
    extraEmail = extraEmail[0];
  }

  if (extraEmail) {
    if (!isEmailAddress(extraEmail)) {
      throw refusal('The other email address does not look valid.', 'invalid-argument');
    }
    add(extraEmail);
  }

  return addresses;
}

function isEmailAddress(value) {
  return typeof value === 'string' && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(value.trim());
}

// Every material at or below its threshold, worst first, with its supplier
// name joined on, as Material::getLowStock() returned it
function loadLowStock() {
  var materials = firestoreQuery({
    from: [{ collectionId: 'materials' }],
    where: fieldFilter('isArchived', 'EQUAL', { booleanValue: false }),
  });

  var low = materials.filter(function (m) {
    return (Number(m.stockQuantity) || 0) <= (Number(m.minThreshold) || 0);
  });

  low.sort(function (a, b) {
    return (Number(a.stockQuantity) || 0) - (Number(b.stockQuantity) || 0);
  });

  for (var i = 0; i < low.length; i++) {
    var cost = firestoreGet('material_costs/' + low[i]._id);
    low[i].supplierName = cost && cost.supplierName ? cost.supplierName : '';
  }

  return low;
}

function loadActiveUsers() {
  return firestoreQuery({
    from: [{ collectionId: 'users' }],
    where: fieldFilter('status', 'EQUAL', { stringValue: 'active' }),
  });
}

// ============================================================
// EMAIL TEMPLATES
//
// Ported from buildAlertEmail() and buildChecklistEmail(), in the same brand
// colours, rebuilt for the place these are actually read: the Gmail app on
// a phone. The originals were a 640 pixel card with a five column table,
// which on a phone meant pinching and scrolling sideways.
//
// So everything is one column, the text is large, the figure that matters
// is the biggest thing on the screen, and the checklist lists each material
// as its own block rather than as a table row. Styles are inline because
// email apps ignore stylesheets, and the layout uses tables because that is
// what every email app, including desktop Outlook, renders consistently.
//
// The brand orange is #d2691e here rather than the #a04b1a the PHP version
// used on the dark header. #a04b1a on #412118 is too faint to read outdoors
// on a phone; #d2691e is the same brand family and is clear at this size.
// ============================================================

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(date, pattern) {
  return Utilities.formatDate(date, CONFIG.TIME_ZONE, pattern);
}

// The outer frame shared by both emails
function emailFrame(innerHtml, preheader) {
  return (
    '<!DOCTYPE html><html><head>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="color-scheme" content="light">' +
    '</head>' +
    '<body style="margin:0;padding:0;background-color:#f4f0eb;">' +
    // The preheader is the line a phone shows under the subject in the
    // inbox list. Hidden in the message itself.
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' + escapeHtml(preheader) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f0eb;">' +
    '<tr><td align="center" style="padding:16px 10px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="max-width:560px;background-color:#ffffff;border:1px solid #c5b9af;border-radius:10px;">' +
    '<tr><td style="background-color:#412118;padding:20px 22px;border-radius:10px 10px 0 0;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:bold;color:#d2691e;line-height:1.2;">Cornerblock</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#c5b9af;margin-top:4px;">Materials Inventory</div>' +
    '</td></tr>' +
    innerHtml +
    '<tr><td style="padding:18px 22px 22px 22px;border-top:1px solid #efe9e3;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#7f6753;">' +
    'An automated message from the Cornerblock Inventory system. Please do not reply to this email.' +
    '</div></td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}

// A large tappable button, which on a phone is easier to hit than a link
function emailButton(href, label) {
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;">' +
    '<tr><td style="background-color:#412118;border-radius:8px;">' +
    '<a href="' + escapeHtml(href) + '" style="display:inline-block;padding:15px 24px;' +
    'font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;">' +
    escapeHtml(label) + '</a></td></tr></table>'
  );
}

function alertEmailHtml(material, trigger, now) {
  var isOut = trigger === 'stock-out';
  var quantity = Number(material.stockQuantity) || 0;
  var threshold = Number(material.minThreshold) || 0;
  var unit = material.unit || '';

  var pillColor = isOut ? '#b91c1c' : '#b45309';
  var pillBackground = isOut ? '#fdecec' : '#fef4e6';
  var pillText = isOut ? 'OUT OF STOCK' : 'LOW STOCK';

  var line = isOut
    ? 'Nothing is left. It cannot be used for production until it is restocked.'
    : 'Stock is at or below the reorder level. Please reorder soon.';

  var inner =
    '<tr><td style="padding:24px 22px 4px 22px;">' +
    '<span style="display:inline-block;padding:6px 12px;border-radius:20px;background-color:' + pillBackground + ';' +
    'font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:0.5px;color:' + pillColor + ';">' +
    pillText + '</span>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:bold;color:#1c1917;line-height:1.3;margin-top:14px;">' +
    escapeHtml(material.name) + '</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#7f6753;margin-top:6px;">' +
    escapeHtml(formatDate(now, "MMMM d, yyyy 'at' h:mm a")) + '</div>' +
    '</td></tr>' +

    // The figure that matters, as the largest thing on the screen
    '<tr><td style="padding:18px 22px 0 22px;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#7f6753;">In stock now</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:44px;font-weight:bold;line-height:1.1;color:' + pillColor + ';">' +
    quantity + ' <span style="font-size:20px;font-weight:normal;color:#1c1917;">' + escapeHtml(unit) + '</span></div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;color:#1c1917;margin-top:10px;">' +
    'Reorder level: <strong>' + threshold + ' ' + escapeHtml(unit) + '</strong></div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.5;color:#1c1917;margin-top:14px;">' +
    escapeHtml(line) + '</div>' +
    emailButton(CONFIG.APP_URL + '/materials?status=' + (isOut ? 'out' : 'low'), 'Open Cornerblock Inventory') +
    '</td></tr>' +
    '<tr><td style="height:22px;"></td></tr>';

  return emailFrame(
    inner,
    pillText + ': ' + material.name + ', ' + quantity + ' ' + unit + ' left'
  );
}

// The plain text version, for mail apps showing text only and for previews
function alertEmailText(material, trigger, now) {
  var isOut = trigger === 'stock-out';
  var unit = material.unit || '';

  return [
    isOut ? 'STOCK-OUT ALERT' : 'LOW-STOCK ALERT',
    '',
    material.name,
    formatDate(now, "MMMM d, yyyy 'at' h:mm a"),
    '',
    'In stock now: ' + (Number(material.stockQuantity) || 0) + ' ' + unit,
    'Reorder level: ' + (Number(material.minThreshold) || 0) + ' ' + unit,
    '',
    isOut
      ? 'Nothing is left. It cannot be used for production until it is restocked.'
      : 'Stock is at or below the reorder level. Please reorder soon.',
    '',
    'Open Cornerblock Inventory: ' + CONFIG.APP_URL,
  ].join('\n');
}

function checklistEmailHtml(materials, now) {
  var count = materials.length;

  var blocks = '';
  for (var i = 0; i < materials.length; i++) {
    var m = materials[i];
    var quantity = Number(m.stockQuantity) || 0;
    var threshold = Number(m.minThreshold) || 0;
    var shortfall = Math.max(0, threshold - quantity);
    var isOut = quantity === 0;
    var unit = m.unit || '';

    // One block per material, stacked, instead of the PHP version's table
    // row. Nothing has to sit side by side, so nothing has to be squeezed.
    blocks +=
      '<tr><td style="padding:14px 22px;border-top:1px solid #efe9e3;">' +
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#1c1917;line-height:1.35;">' +
      escapeHtml(m.name) +
      ' <span style="display:inline-block;padding:3px 9px;border-radius:12px;font-size:12px;font-weight:bold;vertical-align:middle;' +
      (isOut ? 'background-color:#fdecec;color:#b91c1c;">OUT' : 'background-color:#fef4e6;color:#b45309;">LOW') +
      '</span></div>' +
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1c1917;margin-top:6px;">' +
      '<strong style="color:' + (isOut ? '#b91c1c' : '#b45309') + ';">' + quantity + ' ' + escapeHtml(unit) + '</strong> left' +
      ' &middot; reorder at ' + threshold +
      (shortfall > 0 ? ' &middot; short by ' + shortfall : '') +
      '</div>' +
      (m.supplierName
        ? '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#7f6753;margin-top:4px;">Supplier: ' +
          escapeHtml(m.supplierName) + '</div>'
        : '') +
      '</td></tr>';
  }

  var inner =
    '<tr><td style="padding:24px 22px 14px 22px;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:bold;color:#412118;">Reorder Checklist</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#7f6753;margin-top:6px;line-height:1.5;">' +
    escapeHtml(formatDate(now, "MMMM d, yyyy 'at' h:mm a")) + '<br>' +
    count + ' material' + (count === 1 ? ' needs' : 's need') + ' reordering</div>' +
    '</td></tr>' +
    blocks +
    '<tr><td style="padding:4px 22px 22px 22px;border-top:1px solid #efe9e3;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#7f6753;margin-top:14px;">' +
    'Materials leave this list on their own once they are restocked above their reorder level.</div>' +
    emailButton(CONFIG.APP_URL + '/checklist', 'Open the checklist') +
    '</td></tr>';

  return emailFrame(inner, count + ' material' + (count === 1 ? '' : 's') + ' to reorder');
}

function checklistEmailText(materials, now) {
  var lines = [
    'REORDER CHECKLIST',
    formatDate(now, "MMMM d, yyyy 'at' h:mm a"),
    materials.length + ' material' + (materials.length === 1 ? ' needs' : 's need') + ' reordering',
    '',
  ];

  for (var i = 0; i < materials.length; i++) {
    var m = materials[i];
    var quantity = Number(m.stockQuantity) || 0;
    var threshold = Number(m.minThreshold) || 0;
    lines.push(
      '- ' + m.name + ': ' + quantity + ' ' + (m.unit || '') + ' left, reorder at ' + threshold +
        (m.supplierName ? ' (supplier: ' + m.supplierName + ')' : '')
    );
  }

  lines.push('', 'Open the checklist: ' + CONFIG.APP_URL + '/checklist');
  return lines.join('\n');
}

// ============================================================
// FIRESTORE OVER REST
//
// Authenticated with the owner's own OAuth token, from the datastore scope
// in appsscript.json. Access comes from the owner's IAM role on the project,
// not from firestore.rules.
// ============================================================

function firestoreFetch(url, options) {
  var response = UrlFetchApp.fetch(url, {
    method: options.method || 'get',
    contentType: 'application/json',
    payload: options.payload ? JSON.stringify(options.payload) : undefined,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code === 404) return null;

  if (code < 200 || code >= 300) {
    // The usual setup problems, reported in words the Settings page can show
    var text = response.getContentText();
    if (code === 403 && /has not been used|is disabled/.test(text)) {
      throw refusal(
        'The alert service cannot reach Firestore: the Firestore API is not enabled ' +
          'for the Google Cloud project this script runs in. See apps-script/README.md.',
        'setup'
      );
    }
    if (code === 403) {
      throw refusal(
        'The alert service account does not have permission to use Firestore. ' +
          'Grant it the Cloud Datastore User role. See apps-script/README.md.',
        'setup'
      );
    }
    throw new Error('Firestore returned ' + code + ': ' + text);
  }

  return JSON.parse(response.getContentText() || '{}');
}

// One document, decoded into a plain object, or null if it does not exist
function firestoreGet(path) {
  var document = firestoreFetch(FIRESTORE_BASE + '/' + path, {});
  return document ? decodeDocument(document) : null;
}

// A structured query, returning decoded documents
function firestoreQuery(structuredQuery) {
  var rows = firestoreFetch(FIRESTORE_BASE + ':runQuery', {
    method: 'post',
    payload: { structuredQuery: structuredQuery },
  });

  var results = [];
  for (var i = 0; i < (rows || []).length; i++) {
    if (rows[i].document) results.push(decodeDocument(rows[i].document));
  }
  return results;
}

// Creates a document with an id Firestore chooses
function firestoreCreate(collectionId, fields) {
  return firestoreFetch(FIRESTORE_BASE + '/' + collectionId, {
    method: 'post',
    payload: { fields: fields },
  });
}

function fieldFilter(fieldPath, op, value) {
  return { fieldFilter: { field: { fieldPath: fieldPath }, op: op, value: value } };
}

// Firestore's REST format wraps every value in its type. This turns a
// document back into the plain object the rest of the script works with,
// keeping the document id as _id.
function decodeDocument(document) {
  var result = {};
  var fields = document.fields || {};
  for (var key in fields) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      result[key] = decodeValue(fields[key]);
    }
  }
  if (document.name) result._id = document.name.split('/').pop();
  return result;
}

function decodeValue(value) {
  if (value === null || value === undefined) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return new Date(value.timestampValue);
  if ('mapValue' in value) return decodeDocument({ fields: value.mapValue.fields || {} });
  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map(decodeValue);
  }
  return null;
}
