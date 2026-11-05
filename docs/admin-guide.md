# Administrator guide

Administrators have every supervisor capability plus user management, configuration, deletion and the audit log. Everything is under **Administration** in the sidebar.

## Users
**Administration → Users**

- **Add user** — enter name, email, role and region.
  - *Email an invitation link*: the user receives an email and sets their own password (requires working SMTP).
  - *Set a temporary password now*: share it securely; the user changes it under **My profile → Change password**.
  - For **DM Officer** users, choose **Link to officer record** so their My Tickets page shows the right tickets.
- **Edit** (click a row) — change name, phone, role, region and linked officer. You cannot change your own role.
- **Active** switch — deactivated users are signed out and cannot access any data. Their history is kept. You cannot deactivate yourself.

Roles:
- **Admin** — full access.
- **Supervisor** — all tickets, assignment, close/reopen, due-date overrides, reports.
- **Agent** — creates tickets and sees only the ones they created.
- **DM Officer** — sees and works only tickets assigned to their officer record.

## Officers
**Administration → Officers** lists the names that appear in the OFFICER dropdown, with live workload.

- **Add officer** — names are stored in upper case, matching the business spreadsheets.
- Renaming an officer does not break existing tickets (tickets reference the officer record).
- Deactivate officers who leave instead of deleting them; they disappear from pickers but remain on historical tickets and reports.
- "No login" means no user account is linked yet — link one from **Users**.

## Dropdown values
**Administration → Dropdown values** manages the ticket lists (TYPE OF CONTACT, ISSUE TYPE, Region, PAYMENT SOURCE, PAYMENT TYPE, PAYMENT STATUS) and the debt-recovery lists (CUSTOMER TYPE, PROVIDER, FEEDBACK).

The FEEDBACK list is what officers choose from after a debtor call — NO RESPONSE, STOPPED BY ZL, PAID, WILL PAY and so on. Add, rename, reorder or deactivate them as the team's language changes; renaming updates every record that already uses the value.

- **Add** a value at the bottom of each list.
- **Rename** with the pencil — every existing ticket shows the new name immediately.
- **Reorder** with the arrows — this is the order users see in forms.
- **Deactivate** with the switch to hide a value from forms while keeping it on old tickets and in filters.
- **Delete** only works for values that have never been used.

## SLA settings
**Administration → SLA settings** sets, for each ISSUE TYPE:
- **SLA (days)** — DUE DATE = DATE OPENED + this many days. 0 means due the same day.
- **Payment details required** — whether the four payment fields are *mandatory*. The fields are shown on every issue type regardless; this only controls which ones cannot be saved without them.

Changes apply to new tickets and to tickets whose issue type changes. Existing due dates are not recalculated.

Seeded defaults: SERVICE REQUEST 5, DATA ISSUE 3, SERVICE DEFAULT 2, PAYMENT ISSUE 3, PAYMENT ASSIST 2, ENQUIRY 1, UNREFLECTED PAYMENTS 5.

## SMS

**Administration → SMS** is where the text-message service lives.

- **Provider settings** — the mNotify API key, your registered sender ID and a daily cap. The key is stored server-side and is never visible to anyone but administrators. Switch **SMS messaging is on** once the key is in, then use **Send a test message to** to prove it works.
- **Message templates** — each ticket event (logged, assigned, work started, resolved, closed, reopened) can have one template that sends automatically; the rest are ad-hoc templates staff pick from when sending by hand. Placeholders like `{first_name}`, `{ticket_number}` and `{due_date}` are filled in when the message goes out.
- **Recent messages** — everything sent or queued, with the provider's reply when something fails. **Send queued now** pushes anything waiting.

Turning off **Send event messages automatically** stops every automatic message at once, without touching the templates.

## Branding and AI

**Administration → Branding & AI**.

- Upload the company **logo** (PNG, JPG, WEBP or SVG, up to 2 MB), set the **application name**, **tagline** and the **primary** and **accent colours**. The preview on the right shows the sidebar as staff will see it. Changes apply everywhere — sidebar, sign-in page, browser tab and exported PDFs — as soon as you press Save.
- **AI resolution assistant** — optional. Add a key from Anthropic or OpenAI to let officers press "Draft with AI" on a ticket. Without a key the assistant still shows how similar tickets were resolved, which is often enough. The key is stored server-side; the `ai-assist` edge function must be deployed (see the README).

## Audit log
**Administration → Audit log** records every ticket event: creation, each field change with old and new values, assignments, status changes, reopenings, comments and attachments — with the user and time. Filter by ticket number, action, user and dates, and **Export** to Excel for investigations.

## Admin-only ticket actions
- **DATE OPENED** can be set when creating or editing a ticket (for back-dated walk-ins or imports). Importers can also include a DATE OPENED column in DD/MM/YYYY.
- **Delete** a ticket from its detail page. This permanently removes its comments, attachment records and history — prefer closing where possible.

## Housekeeping checklist
- Keep at least two active admins.
- Review inactive users and unlinked officers monthly.
- Configure custom SMTP and correct redirect URLs in Supabase (see README).
- Back up the database (Supabase *Database → Backups*) before bulk imports or renaming values.
- Rotate the service role key if it may have been exposed and redeploy the `invite-user` function.
