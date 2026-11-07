/**
 * Minpaku Guest Check-in — storage backend for your own Google account.
 *
 * Setup (once):
 *   1. Go to script.google.com → New project → paste this whole file.
 *   2. Select the `setup` function in the toolbar → Run → allow access.
 *      The log shows your new Sheet, Passport folder, and APPS_SCRIPT_SECRET.
 *   3. Deploy → New deployment → type "Web app".
 *      Execute as: Me.  Who has access: Anyone.  → Deploy → copy the Web app URL.
 *
 * The app talks to this script with a secret, so only it can read or write.
 * Everything stays private in your Drive.
 */

const PROPS = PropertiesService.getScriptProperties();

function setup() {
  let sheetId = PROPS.getProperty('SHEET_ID');
  if (!sheetId) {
    sheetId = SpreadsheetApp.create('Minpaku Guest Register').getId();
    PROPS.setProperty('SHEET_ID', sheetId);
  }
  let folderId = PROPS.getProperty('FOLDER_ID');
  if (!folderId) {
    folderId = DriveApp.createFolder('Minpaku Passports').getId();
    PROPS.setProperty('FOLDER_ID', folderId);
  }
  let secret = PROPS.getProperty('SECRET');
  if (!secret) {
    secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    PROPS.setProperty('SECRET', secret);
  }
  Logger.log('Sheet:            ' + SpreadsheetApp.openById(sheetId).getUrl());
  Logger.log('Passport folder:  ' + DriveApp.getFolderById(folderId).getUrl());
  Logger.log('APPS_SCRIPT_SECRET (paste into Vercel): ' + secret);
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    const secret = PROPS.getProperty('SECRET');
    if (!secret || req.secret !== secret) throw new Error('unauthorized');
    const fn = ACTIONS[req.action];
    if (!fn) throw new Error('unknown action');
    out = { ok: true, result: fn(req) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

let book_;
function book() {
  if (!book_) book_ = SpreadsheetApp.openById(PROPS.getProperty('SHEET_ID'));
  return book_;
}

function header(sh) {
  return sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getDisplayValues()[0].map(String);
}

// Leading apostrophe stores everything as plain text: no formulas, no date/number conversion.
function text(v) {
  if (v === undefined || v === null || v === '') return '';
  return "'" + String(v);
}

const ACTIONS = {
  // Create missing tabs (with headers and seed rows) and add any missing columns.
  ensure(req) {
    const b = book();
    Object.keys(req.schema).forEach(function (name) {
      const cols = req.schema[name];
      let sh = b.getSheetByName(name);
      if (!sh) {
        sh = b.insertSheet(name);
        sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
        sh.setFrozenRows(1);
        const seed = (req.seed || {})[name] || [];
        if (seed.length) {
          sh.getRange(2, 1, seed.length, cols.length).setValues(
            seed.map(function (r) { return cols.map(function (c) { return text(r[c]); }); }),
          );
        }
      } else {
        const have = header(sh).filter(String);
        const missing = cols.filter(function (c) { return have.indexOf(c) < 0; });
        if (missing.length) sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
      }
    });
    // Remove the empty default tab.
    b.getSheets().forEach(function (sh) {
      if (!req.schema[sh.getName()] && sh.getLastRow() === 0 && b.getSheets().length > 1) b.deleteSheet(sh);
    });
    return true;
  },

  read(req) {
    const res = {};
    req.tabs.forEach(function (name) {
      const sh = book().getSheetByName(name);
      if (!sh) { res[name] = []; return; }
      const vals = sh.getDataRange().getDisplayValues();
      const head = vals.shift() || [];
      res[name] = vals
        .filter(function (r) { return r.some(function (c) { return String(c).trim(); }); })
        .map(function (r) {
          const o = {};
          head.forEach(function (h, i) { if (h) o[h] = String(r[i]).trim(); });
          return o;
        });
    });
    return res;
  },

  append(req) {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sh = book().getSheetByName(req.tab);
      sh.appendRow(header(sh).map(function (h) { return text(req.row[h]); }));
    } finally {
      lock.releaseLock();
    }
    return true;
  },

  upload(req) {
    const blob = Utilities.newBlob(Utilities.base64Decode(req.base64), req.mimeType, req.name);
    const f = DriveApp.getFolderById(PROPS.getProperty('FOLDER_ID')).createFile(blob);
    return { id: f.getId(), url: f.getUrl() };
  },

  download(req) {
    const f = DriveApp.getFileById(req.id);
    const folderId = PROPS.getProperty('FOLDER_ID');
    const parents = f.getParents();
    let inFolder = false;
    while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
    if (!inFolder) throw new Error('not found');
    const b = f.getBlob();
    return { base64: Utilities.base64Encode(b.getBytes()), mimeType: b.getContentType() };
  },

  mail(req) {
    MailApp.sendEmail({ to: req.to, subject: req.subject, body: req.body, name: 'Guest Check-in' });
    return true;
  },
};
