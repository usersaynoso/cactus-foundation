# Managing users

The **Users** section in the admin lets you see who has access to your site and control what each person can do.

This covers admin **Users** only - people who can access your admin area. For visitor accounts (registration, sign-in, public profiles), see [Members](Members).

---

## Roles and permissions

Every user is assigned a **role**. A role is a named set of permissions that determines which parts of the admin that user can access and what actions they can take.

Cactus comes with one built-in role: **Admin**. The Admin role always has full access and cannot be edited or deleted.

You can create as many additional roles as you need - for example, an Editor who can manage pages but not change site settings, or a Moderator for a specific module.

### Creating a role

1. Go to **Users → Roles**.
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

The list shows each user's name, email address, role, and when they last signed in.

---

## Adding users

### Public registration

If **public registration** is turned on (see **Settings → Auth & Access**), anyone can create an account via the registration page on your public site. You can set a **default role** that new registrations are automatically assigned.

If you only want specific people to have accounts, turn registration off and create accounts manually.

### Creating an account manually

Currently, new accounts are created through the public registration flow. To add someone without opening registration to the public:

1. Temporarily turn on public registration (**Settings → Auth & Access**).
2. Have the person register on the public site.
3. Turn registration off again.
4. Find the new user in the **Users** list and change their role to the appropriate one.

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

## Registration and access settings

Go to **Settings → Auth & Access** to control:

- **Public registration** - whether new visitors can create accounts.
- **Default role** - the role automatically assigned to new registrations.
- **Trust this browser** - how long a "trust this browser" cookie lasts before asking for a one-time code again.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Members](Members) · [Managing media](Managing-media) · [Modules](Modules) · [Configuration reference](Configuration-reference)
