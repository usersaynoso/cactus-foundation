# Modules

Modules are add-ons that extend Cactus with extra features - a contact form, a blog, a forum, an events calendar, and more. Each module is self-contained: it can be installed, switched off, or removed without affecting anything else on your site.

---

## Finding modules

Go to **Modules → Available** in the admin to browse the directory of officially listed modules. These are reviewed and published by the Cactus Foundation.

You can also install any module directly from a public GitHub repository if you have the URL.

---

## Installing a module

**From the directory:**

1. Go to **Modules → Available**.
2. Click **Install** next to the module you want.
3. Cactus installs it and triggers a short rebuild. A progress screen appears - this typically takes under two minutes.

**From a GitHub URL:**

1. Go to **Modules → Install**.
2. Paste the GitHub repository URL.
3. Click **Install** and wait for the rebuild.

Once installed, the module appears in your admin sidebar if it adds any admin pages.

### Setting up a module

Some modules need extra credentials - for example, a contact form module might need email settings to send you notifications. After installation, any required settings appear as a checklist. Fill them in and save. Cactus applies the settings with another short rebuild.

---

## Enabling and disabling modules

You can switch a module off without removing it. A disabled module's features are hidden from visitors and its admin pages disappear from the sidebar - but all its data is preserved and ready to go if you enable it again.

To toggle a module on or off, go to **Modules** in the admin and use the **Enable** / **Disable** toggle next to the module.

---

## Updating a module

When a newer version of a module is available, an update notice appears on the **Modules** page.

1. Click **Update** next to the module.
2. Cactus installs the new version and triggers a short rebuild.
3. A progress screen keeps you updated.

---

## Uninstalling a module

1. Go to **Modules** and click the module you want to remove.
2. Click **Uninstall**.
3. Choose what to do with the module's data:
   - **Remove code only** - the module is removed from your site, but all its stored data (posts, submissions, etc.) is kept in the database.
   - **Remove code and data** - the module and all its data are permanently deleted. This option is only available if the module supports it.
4. Confirm. A short rebuild completes the removal.

> **Heads up:** "Remove code and data" is permanent and cannot be undone. If you think you might reinstall the module later, choose "Remove code only" to keep your data safe.

---

## The update channel

Cactus itself (not just modules) can be updated from **Settings → General**. There are two update channels:

- **Public** (default) - stable releases only.
- **Beta** - stable releases plus pre-releases. Useful for trying new features early, though they may have rough edges.

Switch between them using the buttons at the top of the Updates panel. The change takes effect immediately with no page reload needed.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Configuration reference](Configuration-reference)
