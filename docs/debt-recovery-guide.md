# Debt recovery guide

Every month a list of customers with outstanding balances is uploaded, shared out among officers, and worked through by phone. This is how that runs in the app.

## The monthly cycle

1. **A supervisor uploads the list** for the month.
2. **Officers call their accounts** and record what happened: amount collected, feedback and a comment.
3. **Supervisors watch progress** on the Analytics tab and chase what is still pending.
4. At month end the supervisor **closes the month** and uploads the next one.

---

## For supervisors and admins

### Uploading the list

**Debtor Lists → Upload list**. Your spreadsheet needs these columns (the header wording is flexible — OFFICER, BALANCE, PHONE and similar are all recognised):

| Column | Required | Notes |
| --- | --- | --- |
| CUSTOMER ID | no | Your account reference |
| CUSTOMER NAME | **yes** | |
| CUSTOMER TYPE | no | Residential, commercial… Add new values on the fly |
| PROVIDER | no | Service provider |
| COMMUNITY | no | |
| CONTACT NUMBER | no | Ghana format; broken numbers are blanked and flagged |
| OUTSTANDING BALANCE | no | Blank counts as 0 |
| OFFICER | no | Must match an officer name exactly; blank means unassigned |

Press **Download template** to get a file with the right headers and a second sheet listing every allowed customer type, provider and officer name.

Before anything is saved you see every row with a green tick, an amber warning (imported with a note, e.g. a bad phone number) or a red error (skipped, e.g. an officer who doesn't exist). Three options sit above the preview:

- **Replace this month's list** — deletes what is already there for that month first. Use it when re-uploading a corrected file, and remember it also deletes any feedback already recorded.
- **Add new customer types / providers** — adds values your spreadsheet uses that aren't in the system yet.
- **Notify officers** — sends each officer one message telling them how many accounts and how much is on their list.

### Assigning and reassigning

Rows uploaded without an officer show as **Unassigned** — the red KPI card filters to them. Tick the rows, press **Assign officer**, and pick from the list; the picker shows each officer's current ticket workload so you can balance fairly.

### Watching progress

The cards across the top show accounts, outstanding, collected, still to call, contact rate and unassigned. The **Analytics** tab adds:

- collected against outstanding for each officer,
- the mix of feedback reasons (how much is NO RESPONSE versus WILL PAY versus PAID),
- outstanding by provider, customer type and community,
- month-on-month collection rate,
- a per-officer table you can export to Excel or PDF.

### Closing a month

**Close month** marks the period closed. It is a signal to the team rather than a lock, and you can reopen it at any time.

---

## For officers

**My Debtor List** shows only the accounts assigned to you, for the month you pick at the top right.

The six cards are your targets: accounts, still to call, worked, outstanding, collected, and promises that have fallen due. Tap any card to filter the list below.

For each account:

1. Tap **Call** (your phone dials) or **WhatsApp**. **SMS** sends a text with the customer's balance filled in automatically.
2. Tap the card to open it and log the result:
   - **FEEDBACK** — pick the reason that matches what happened (NO RESPONSE, WILL PAY, PAID, WRONG NUMBER…). This is required.
   - **AMOUNT COLLECTED** — only when money was actually paid.
   - **Promised amount and date** — appear when the feedback is a positive one; fill them in when the customer commits to pay later.
   - **COMMENT** — anything a colleague would need to know next time.
3. **Save call result.**

The account moves from *Pending* to *Worked*, or to *Collected* once an amount is recorded. Your call attempts are counted automatically, and the **Promises** tab brings back everyone who promised to pay by a date that has now passed.

You can change what you logged at any time while the month is open. You cannot edit the customer's name, balance or assignment — ask a supervisor if something is wrong.
