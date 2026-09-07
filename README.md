# AREESE Marks

JEE / NEET / Class 9–12 marks management. Ek codebase, teen output: **web app** (GitHub Pages), **Android APK** (sideload), **Telegram Mini App + bot**. Data **Google Sheet** me rehta hai — backend **Apps Script**. Sab free.

```
Phone / Laptop / Telegram  ──►  React PWA (GitHub Pages / APK)
                                        │  HTTPS JSON
                                        ▼
                     Google Apps Script web app  ◄──  Telegram bot webhook
                                        │
                                        ▼
                     Google Sheet (Students, Batches, Tests, ek tab per test)
```

## Kya milta hai

- **Marks entry grid**: Correct/Wrong type karo → Unattempted, negative marking, total, rank, percentile live. Enter se neeche jao. Absent tick. Excel se bhi bhar sakte ho (`PHY_C`, `PHY_W` columns ya direct `PHY`).
- **Patterns**: JEE Main (75Q/300), NEET (180Q/720), JEE Advanced, Board, custom.
- **Results**: rankings, subject toppers, batch avg, Excel export, **report card image → WhatsApp/Telegram share**.
- **Publish → Telegram**: publish karte hi har linked student/parent ko result message.
- **Student/Parent view**: apne results, trend graph, report cards (app me ya Telegram Mini App me).
- **Analytics**: batch trend, 3 test lagataar girne wale students flagged.
- **Roles**: admin (sab), faculty (apne batch/subject tak), student/parent (sirf apna published result).
- **Offline**: net na ho to entries phone me save, net aate hi sync.

Data sheet me raw hai — kabhi bhi sheet kholke dekho/sudharo, app totals/ranks raw se dobara nikalta hai.

---

## Setup (ek baar, ~30 minute)

### 1. Google Sheet + Apps Script (backend)

1. Nayi Google Sheet banao: naam `AREESE Marks 2026-27`.
2. **Extensions → Apps Script**. Default `Code.gs` ka content hatao, is repo ka `apps-script/Code.gs` paste karo.
3. Left me ⚙️ **Project Settings → "Show appsscript.json manifest"** tick karo. Editor me `appsscript.json` kholke is repo wala content paste karo.
4. Function dropdown me **`setup`** chuno → **Run** → permissions allow karo. Sheet me tabs ban jayenge (Settings, Users, Batches, Students, Tests, Log). Default login: `admin` / `1234`.
5. **Deploy → New deployment → ⚙️ Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy → **Web app URL** copy karo (`https://script.google.com/macros/s/…/exec`). Yahi app ka server URL hai.

> Code update karne par: **Deploy → Manage deployments → ✏️ → Version: New → Deploy** (URL same rehta hai).

### 2. Telegram bot

1. Telegram me **@BotFather** → `/newbot` → naam do (e.g. `AREESE Marks`, username `areese_marks_bot`) → **token** copy karo.
2. Apps Script → ⚙️ Project Settings → **Script properties** → add:
   - `BOT_TOKEN` = BotFather wala token
   - `API_URL` = step 1 ka `/exec` URL
3. Editor me function **`setWebhook`** run karo. Log me `"ok":true` dikhna chahiye.
4. Bot ko test karo: `/start` bhejo → welcome message aaye.

### 3. Web app (GitHub Pages)

1. GitHub par naya repo banao (e.g. `areese-marks`), ye poora folder push karo (`main` branch).
2. Repo **Settings → Secrets and variables → Actions → Variables → New repository variable**: `VITE_API_URL` = step 1 ka `/exec` URL. (Isse web app aur APK me server URL pehle se bhara hota hai — kisi ko paste nahi karna padta.)
3. Repo **Settings → Pages → Source: GitHub Actions**.
4. **Actions** tab me "Deploy web app to GitHub Pages" khud chalega. URL: `https://<username>.github.io/areese-marks/`
5. App kholo → `admin` / `1234` se login. (Variable set nahi kiya to pehli screen par server URL paste karo → Connect.)

Tip: link me `?api=<exec URL>` laga do to wo device khud server URL pakad leta hai — Mini App URL ke liye kaam aata hai.

### 4. Telegram Mini App (same web URL)

@BotFather me:
- `/mybots` → bot → **Bot Settings → Menu Button → Configure menu button** → Pages URL do, title `Marks`.
- (Optional) `/setdomain` → `<username>.github.io`

Ab students bot me menu button dabakar app kholenge — Telegram se auto-login (link hone ke baad).

### 5. Android APK

1. Repo → **Actions → Build Android APK → Run workflow**.
2. Pehli baar do artifacts milenge: **`AREESE-Marks-apk`** aur **`keystore-SAVE-THIS`**.
3. Keystore secret me daalo (taaki future update same signature se install ho):
   - `keystore-SAVE-THIS` download karo, unzip → `areese.jks`
   - Terminal: `base64 -w0 areese.jks` (Mac: `base64 -i areese.jks`) → output copy
   - Repo **Settings → Secrets and variables → Actions → New secret**: `KEYSTORE_B64` = wo output, `KEYSTORE_PASS` = `areese123`
4. APK Telegram/WhatsApp se bhejo → phone par "Install from unknown sources" allow → install.
5. Naya version: `git tag v1.0.1 && git push --tags` → APK **Releases** me attach ho jayega.

App name/icon badalna ho: `capacitor.config.json` me `appName`, icon ke liye `npx @capacitor/assets generate --android` (source `assets/icon.png` 1024×1024).

---

## Roz ka kaam

**Pehli baar**
1. Settings → Institute name, session, **bot username** bharo → Save.
2. Settings → Staff logins → faculty add karo (PIN, batch, subject scope). Apna admin PIN Users tab me badlo.
3. Students → **Import Excel** (columns: `roll, name, batch_id, class, stream, father, phone, parent_phone`; `batch_id` me batch ka ID ya exact naam). Template button se sample lo.

**Har test**
1. Tests → New test → pattern chuno → batch tick → Create.
2. Marks type karo (ya Excel se bharo) → **Save**.
3. Results dekho → **Publish** → "Send on Telegram" tick → sab linked students/parents ko message.
4. Report card tap → **Share card** → WhatsApp.

**Students/parents ko Telegram se jodna** (ek baar)
- Student: bot me `/link 98XXXXXXXX` (registered mobile) — ya Students → student → **Student link / Parent link** copy karke bhejo (`t.me/<bot>?start=S0001`).
- Uske baad `/marks` = latest result; Mini App me poora record.

**Student/Parent login app me (bina Telegram)**: Roll number + registered mobile.

---

## Sheet structure

| Tab | Columns |
|---|---|
| Settings | key, value (`institute_name`, `session`, `bot_username`) |
| Users | user_id, name, pin, role (admin/faculty), batches, subjects, tg_id, active |
| Batches | batch_id, name, class, stream, session, active |
| Students | student_id, roll, name, batch_id, class, stream, father, phone, parent_phone, tg_id, parent_tg_id, active, created_at |
| Tests | test_id, name, date, batch_ids, pattern, mode (cwu/marks), subjects_json, total_max, published, created_by, created_at, sheet |
| `T001 Minor Test 1` | student_id, roll, name, absent, `PHY_C, PHY_W, PHY_U, PHY_M`, … , TOTAL, PCT, RANK, PCTL, updated_at, updated_by |

Scoring: `M = C×plus − W×minus`, `U = Q − C − W`. Rank competition style (1, 2, 2, 4). Percentile NTA style = 100 × (students with total ≤ yours) / appeared. Sirf raw columns (C/W ya M) source of truth hain; TOTAL/RANK app har save par likhta hai.

Backup: Google Drive **File → Version history**. Alag session ke liye nayi Sheet + naya deployment.

## Local development

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # dist/
```

Backend logic (scoring, ranking, auth, Telegram) ka mock test: `apps-script/Code.gs` ko is repo ke saath diye harness se chalaya gaya tha; scoring rules `src/lib/scoring.js` aur `Code.gs` me identical hain — dono jagah saath badlo.

## Limits (free tier)

- Apps Script: 90 min/day execution, 20k URL fetches/day (Telegram messages) — 750 students ke liye kaafi.
- Sheet: 10M cells. Ek session ki sheet me 100+ tests aaram se.
- GitHub Actions: 2,000 min/month — ek APK build ≈ 8 min.
