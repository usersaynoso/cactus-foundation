# Managing users

The **Users** section in the admin lets you see who has access to your site and control what each person can do.

This covers admin **Users** only - people who can access your admin area. For visitor accounts (registration, sign-in, public profiles), see [Members](Members).

---

## Roles and permissions

Every user is assigned a **role**. A role is a named set of permissions that determines which parts of the admin that user can access and what actions they can take.

Cactus comes with one built-in role: **Admin**. The Admin role always has full access and cannot be edited or deleted. If you switch on the [Members](Members) system, a second protected role called **Members** appears the moment your first visitor registers - it's just a label so members show a role badge in the combined Users list; it carries no admin permissions and members never use it to access the admin area.

You can create as many additional roles as you need - for example, an Editor who can manage pages but not change site settings, or a Moderator for a specific module.

### Creating a role

1. Go to **Settings → Users → Roles**.
2. Click **New role**.
3. Give the role a name.
4. Tick the permissions you want this role to have. Permissions are grouped by area (Pages, Media, Users, Settings, and so on). Installed modules add their own permissions to the list.
5. Click **Save**.

### Editing or deleting a role

Click any role in the list to edit its name or permissions. Click **Delete** to remove it.

Deleting a role does not delete users who had that role - those users simply end up with no role assigned.

---

## Viewing users

Go to **Users** in the admin sidebar to see a list of everyone with an account on your site.

The list shows each user's name, email address, role, and when they joined - and it's a combined list: admin staff and site [members](Members) both appear here, side by side, with a **Type** column telling them apart. Staff rows still have the role/suspend/delete controls right there in the table; click a member row to open their full profile and management options instead (approve, suspend, trust, and so on).

---

## Adding users

There's no public sign-up for admin accounts - the only admin user created automatically is the one made during setup. To give someone else access to the admin, add them through the [Members](Members) system instead (invite or registration, depending on how you've configured it), then assign them a role with the permissions they need from the **Users** list.

---

## Changing a user's role

1. Go to **Users** and click the user.
2. Select a new role from the **Role** dropdown.
3. Save.

The change takes effect immediately.

---

## Suspending a user

Suspending a user locks them out of the admin immediately without deleting their account. Their content and history are preserved.

1. Go to **Users** and click the user.
2. Click **Suspend**.

To reinstate a suspended user, click **Unsuspend** on the same page.

---

## Deleting a user

1. Go to **Users** and click the user.
2. Click **Delete**.
3. Confirm.

Deleting an account is permanent. Their pages and other content are not automatically deleted.

---

## Your own account

To change your display name, email address, or password, click **My account** at the bottom of the admin sidebar (or go to `/<your-admin-path>/account`).

### Passkeys

Passkeys are the primary way to sign in to Cactus - they use your device's fingerprint reader, Face ID, or a security key instead of a password. They're faster and more secure than a password alone.

The sign-in page asks your device for a passkey as soon as it loads - no button to click first. If you dismiss the prompt (or your browser wants a click before it will show one), the page reveals the other ways in: **Use another way to sign in** gives you the passkey button again alongside the password and authenticator app options.

To add a new passkey:

1. Go to **My account → Passkeys**.
2. Click **Add passkey** and follow the prompt from your device.

You can register multiple passkeys - for example, one on your laptop and one on your phone.

### Authenticator app

If a passkey isn't an option on your device, you can sign in with an authenticator app instead (Google Authenticator, Authy, 1Password, and similar apps all work). It's just as secure as a passkey - a different way of proving it's really you.

To set it up:

1. Go to **My account → Authenticator app** and click **Set up authenticator app**.
2. Scan the QR code with your authenticator app, or type in the key shown underneath if you can't scan it.
3. Enter the 6-digit code your app shows to confirm it's connected.

Once it's set up, you'll see an **"Use authenticator app instead"** option on the sign-in page. Click **Remove** on the account page if you want to stop using it.

### Password

If email is set up on your site, you can also sign in with a password and a one-time code sent to your email. To set or change your password, go to **My account → Password**.

---

## Access settings

Go to **Settings → General** to control:

- **Admin path** - the secret URL prefix for your admin area.
- **Trust this browser** - how long a "trust this browser" cookie lasts before asking for a one-time code again.

For visitor registration settings, see [Members](Members).

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Members](Members) · [Managing media](Managing-media) · [Modules](Modules) · [Configuration reference](Configuration-reference)
