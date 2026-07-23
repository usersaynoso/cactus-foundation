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
2. Each module has a **Public** / **Beta** switch. Leave it on **Public** for the stable release, or switch to **Beta** to install the latest pre-release instead - useful for trying new features early, though they may have rough edges.
3. Click **Install** (it reads **Install beta** when the Beta switch is on).
4. Cactus installs it and triggers a short rebuild. A progress screen appears - this typically takes under two minutes.

A module installed from the Beta switch starts life on the **Beta** update channel, marked with a **Beta** badge next to its version once installed. You can switch it back to **Public** at any time - see "Each module's update channel" below.

**From a GitHub URL:**

1. Go to **Modules → Install**.
2. Paste the GitHub repository URL.
3. Click **Install** and wait for the rebuild.

Once installed, the module appears in your admin sidebar if it adds any admin pages.

**If a module needs a newer Cactus than you're running**, the install is politely refused and you'll be told to update Cactus first. Do the update, then install the module - the other way round ends in a broken deployment, which is why we don't let it happen.

### Setting up a module

Some modules need extra credentials - for example, a contact form module might need email settings to send you notifications. After installation, any required settings appear as a checklist. Fill them in and save. Cactus applies the settings with another short rebuild.

---

## Enabling and disabling modules

You can switch a module off without removing it. A disabled module's features are hidden from visitors and its admin pages disappear from the sidebar - but all its data is preserved and ready to go if you enable it again.

To toggle a module on or off, go to **Modules** in the admin and use the **Enable** / **Disable** toggle next to the module.

---

## Updating a module

Cactus checks each installed module for updates once when you open the **Modules** page. While it's checking, you'll see "Checking for updates..." next to the module's version - this only takes a moment.

If you want to check again straight away, click the small refresh icon (↻) next to a module's version. To avoid hammering GitHub, the automatic check only runs once every ten seconds per module - reloading the page again within that window reuses what was last found rather than checking again. Clicking refresh always checks right away, ignoring that wait.

When a newer version is available, an update notice appears next to the module.

1. Click **Update** next to the module.
2. Cactus installs the new version and triggers a short rebuild.
3. A progress screen keeps you updated.

If two or more modules all have updates waiting, an **Update all** button appears above the installed list. Click it to install every pending update in one go - it's a single rebuild covering all of them, rather than one rebuild per module.

**Update all now checks compatibility one module at a time**, exactly as updating a single module has always done. A module that needs a newer version of Cactus than you're running, or another module you haven't installed, is left on its current version and reported back to you with the reason. The rest go ahead. Previously the bulk button took every latest version on trust, and one module wanting a newer Cactus could stop the site rebuilding at all - a bad afternoon for the sake of a convenience button.

Cactus also reads a module's requirements from the exact release it's about to install, rather than from whatever the module's authors have committed since. What you're told about a version is what that version actually says about itself.

### "An install is already in progress"

Only one install, update or removal can run at a time, which is why a second one is turned away with that message. If the first one was cut short - the odd occasion where the job is stopped mid-flight rather than finishing or failing properly - that hold used to stay put and nothing could be installed or updated again. Now anything left holding on for more than fifteen minutes is treated as abandoned and cleared automatically, so the next attempt simply works. Fifteen minutes is comfortably longer than any genuine install takes, rebuild included.

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

## Cactus's own update channel

Cactus itself (not the modules) is updated from **Settings → General**, which is covered on the [Configuration reference](Configuration-reference) page.

## Each module's update channel

Every installed module has its own update channel, set independently of every other module and of Cactus's own channel:

- **Public** (default) - stable releases only.
- **Beta** - stable releases plus pre-releases. Useful for trying a module's new features early, though they may have rough edges.

You'll find **Public** / **Beta** buttons next to each module on the **Modules** page. Switching a module's channel takes effect immediately - the next time Cactus checks that module for updates (automatically or via the refresh icon), it checks against the newly chosen channel.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Gazette](Gazette) · [Boards](Boards) · [Directory](Directory) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Product Attributes](Product-attributes) · [Reply Catcher](Reply-catcher) · [Gemini Watermark Remover](Gemini-Watermark-Remover) · [Ultimate SEO](Ultimate-SEO) · [Configuration reference](Configuration-reference)
