# Setu — Demo walkthrough (applicant → officer → bank → admin)

One clean path through every role: an applicant signs in, builds a report,
submits it; the officer who covers that block approves it; the applicant
downloads a dossier carrying a **Verified Approval**; a bank scans the QR to
check it; the admin sees every step in the audit log.

> "Verified Approval" is a tamper-evident hash checked against Setu's
> records — **not** a government digital signature (DSC). Nothing in the app
> calls it "digitally signed".

## 0. Setup (once)

```bash
docker compose up -d                       # Postgres :5433, Redis :6380
npm run db:migrate
npm run ingest:admin-hierarchy -w apps/api # real TN districts/blocks (skip if already loaded)
npm run db:seed:demo-flow -w apps/api      # the accounts below — idempotent, safe to re-run
npm run dev:api                            # terminal 1 — OTP codes are printed HERE
npm run dev:web                            # terminal 2 — http://localhost:5173
```

`SMS_PROVIDER=console` (the default) prints each OTP in the **API terminal** as
`[SMS:console] OTP for +91…: 123456`. Google sign-in appears only if
`GOOGLE_OAUTH_CLIENT_ID` is set (see `.env.example`); phone OTP always works.

### Seeded accounts

| Role | Name | Phone (sign in with the last 10 digits) | Covers / location |
|---|---|---|---|
| Admin | Setu Administrator | +91 99999 00009 (or `ADMIN_BOOTSTRAP_PHONE`) | — |
| Officer | K. Meena, DIC Officer | +91 99999 00001 | **all of Madurai** district |
| Officer | R. Suresh, BDO | +91 99999 00002 | Coimbatore — **Pollachi, Sulur** blocks |
| Officer | A. Fathima, Lead District Manager | +91 99999 00003 | **all of Tiruchirappalli** district |
| Applicant | Lakshmi S. | +91 98765 00001 | Madurai / Melur — *no application yet (you create it live)* |
| Applicant | Murugan P. | +91 98765 00002 | Coimbatore / Pollachi — submitted, with R. Suresh |
| Applicant | Selvi R. | +91 98765 00003 | Tiruchirappalli / Srirangam — already approved by A. Fathima |
| Applicant | Arjun K. | +91 98765 00004 | Dindigul / Palani — **no officer covers Dindigul → unassigned queue** |

The OTP limit is 1 code per 60 s and 5 per hour per number. If you rehearse
a lot, wait, or clear the `ratelimit:otp-*` / `otp:cooldown:*` keys in the
local Redis. (On this machine the containers run under colima: if
`docker ps` shows nothing, use `docker --context colima …` or
`docker context use colima`.)

## 1. Applicant signs in and creates a report

1. Open **http://localhost:5173/**. The home page is public and unchanged.
   The nav shows only *Home* and *Sign in*.
2. Click **Check My Eligibility** (the hero button). You land on **/signin**,
   because everything past the home page needs an account.
3. Enter `9876500001` → **Send code** → type the code from the API
   terminal → **Verify**. You come back to the eligibility wizard you were
   opening. The nav now shows the applicant menu (*My Dashboard, Check
   Eligibility, Bahi-Khata, …*).
4. Wizard: State **Tamil Nadu** → District **Madurai** → Block **Melur** →
   **Continue** → **Dairy** → **Continue** → **Generate My Report**.

## 2. Save it as an application and submit

5. At the top of the results page, **Ready to apply?** → **Save as
   application**. You land on **My Dashboard** with the new application in
   **Draft**.
6. **Submit for officer review** → optionally type a proprietor name →
   **Submit now**.
7. The timeline moves to **Submitted**, and the card reads **"With K. Meena,
   District Industries Centre Officer, Madurai"**. Melur is in Madurai and
   K. Meena covers that district, so it was auto-assigned. The dossier is
   frozen at this moment.
8. **Sign out**.

## 3. Officer reviews and approves

9. **Sign in** → `9999900001` (K. Meena) → OTP. The officer lands on
   **Review Queue**, and the nav shows only *Review Queue* (plus *More*).
10. Lakshmi's Dairy application is selected under **Open**. Optionally click
    **Open the frozen dossier** to see exactly what the bank will get
    (*Pending review* at the bottom).
11. **Start review**. Status: **Under review**.
12. **Approve**. The officer's name, designation and timestamp are recorded
    permanently, and the Verified Approval hash is issued. (*Ask for more
    info* and *Reject* need a note, which the applicant sees.)
13. Optional check: open http://localhost:5173/bahi-khata as the officer.
    You're sent back to the Review Queue. The API would return 403 anyway.
14. **Sign out**.

## 4. Applicant downloads the verified dossier

15. Sign in as `9876500001` again. You land on **My Dashboard**, and the
    application shows **Approved** with the full timeline.
16. **Download verified dossier** → **Download / Print Verified Dossier**
    (the browser's *Save as PDF*). The last block reads **VERIFIED
    APPROVAL**, with the APPROVED stamp, *K. Meena*, *District Industries
    Centre Officer, Madurai*, date and time, the verification hash, and a
    **QR code**.

## 5. Bank verifies the QR

17. Scan the QR with a phone, or open the link printed under the hash
    (`/verify/<hash>`) in a private window. No sign-in is needed.
18. It shows **Genuine approval**: approved by, designation, approved on,
    document reference. Nothing about the applicant is shown.
19. Tamper test: change one character of the hash in the URL. You get
    **Not a valid approval**.

## 6. Admin sees everything

20. Sign in as `9999900009`. You land on **Admin Portal**.
21. **Applications** opens on the **Unassigned queue**, showing **Arjun K.
    — Retail, Palani, Dindigul**, because no officer covers Dindigul. Use
    **Assign to…** to route it, e.g. to A. Fathima. That assignment is
    audited.
22. Switch the filter to **Approved** → Lakshmi's application →
    **Timeline & audit trail**. You see every step: saved → submitted →
    auto-assigned (system) → review started → approved.
23. **Audit Log** tab: the same entries across the whole programme,
    newest first.
24. **Officers** tab: invite an officer (phone and/or Gmail, name,
    designation), add or remove districts/blocks, or deactivate someone.
    Nobody can sign up as an officer or admin.

## Also worth showing

- **One account, two methods.** Signed in by phone, go to *More → My
  Account → Google sign-in* and link a Gmail. Later, signing in with that
  Gmail opens the same account. Linking a Gmail or phone that already
  belongs to another account is refused rather than merged.
- **More info → resubmit.** As the officer, choose *Ask for more info* with
  a note. The applicant sees the note on their card, can **Update my
  report** (re-run the wizard, then *Use for: …* on the results page) and
  **Resubmit**. It goes back to the same officer.
- **Editing after approval never overwrites.** Attaching a new report to an
  approved application returns it to Draft. The old approval row is kept,
  and its QR now verifies as **Genuine, but superseded**.
