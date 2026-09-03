# Modules

Modules are add-ons that extend Cactus with extra features - a contact form, a blog, a forum, an events calendar, and more. Each module is self-contained: it can be installed, switched off, or removed without affecting anything else on your site.

---

## Finding your way around

The **Modules** page is laid out in four tabs, with a search box on the right of the tab bar that filters whichever tab you are on by name or description:

- **Installed** - everything on your site now. This is where the page opens, unless you have nothing installed yet.
- **Updates available** - only the modules with a newer release waiting. The number on the tab is how many.
- **Browse** - the directory of officially listed modules, reviewed and published by the Cactus Foundation.
- **Add your own** - install a module from any GitHub repository you have the address for.

Every module is shown as a card with its own picture, its name, what it does, and one button for the obvious thing to do next. Everything else - turning it off, changing which releases it follows, uninstalling - lives behind the **…** button in the corner of the card, so the card itself stays readable.

A module with no picture of its own gets a plain green tile with its initial on it. Nothing is wrong; that one simply hasn't been drawn yet.

---

## Installing a module

**From the directory:**

1. Go to **Modules → Browse**.
2. Click **Install** on the card. That fetches the finished release, which is what almost everyone wants.
3. To take the latest pre-release instead, open the card's **…** menu, choose **Early (beta) releases**, and the button changes to **Install beta**. Useful for trying new features early, though they may have rough edges.
4. If a Cactus update or other module updates are waiting, a short dialog appears first - see "Bringing everything else along" below. If nothing is waiting, the install starts immediately.
5. Cactus installs it and triggers a short rebuild. A progress screen appears - this typically takes under two minutes.

Some modules have only ever put out a pre-release. Those are marked **Beta only** and there is nothing to choose.

A module installed as a beta starts life following early releases, marked with a **Beta** badge next to its version once installed. You can switch it back at any time - see "Each module's update channel" below.

**From a GitHub URL:**

1. Go to **Modules → Add your own**.
2. Paste the GitHub repository URL.
3. Click **Install** and wait for the rebuild.

Once installed, the module appears in your admin sidebar if it adds any admin pages.

### Bringing everything else along

Every install means one rebuild. Doing an install, then a Cactus update, then a round of module updates means sitting through three of them, which is two too many.

So when you click **Install**, Cactus has a quick look for anything else waiting - you'll see the button say *Checking…* for a moment - and if it finds something, it asks first. The dialog offers, ticked by default:

- **Also update Cactus to v…** - shown when a Cactus update is waiting. Only offered if you're allowed to change settings; if module installs are all you can do, this one won't appear.
- **Also update the modules with updates waiting** - shown when any installed module has a newer release, listing which ones and what they'd move to.

Untick whatever you'd rather leave alone. Everything ticked goes out in the same deployment as the install, so you wait once.

Nothing waiting means no dialog at all - the install just gets on with it, as it always did. The look is taken at the moment you click rather than when the page loaded, so a Cactus release that landed while you were reading the store still gets offered.

Each update is still checked for compatibility on its own, exactly as **Update all** does. Anything that isn't happy - a module wanting a newer Cactus than the one going out, or another module you haven't got - is left where it is and reported back with the reason, while the rest go ahead.

**If a module needs a newer Cactus than you're running**, the install is politely refused and you'll be told to update Cactus first - the other way round ends in a broken deployment, which is why we don't let it happen. If the waiting Cactus update is new enough to satisfy it, though, the message comes with an **Update Cactus and install** button: both go out together in one deployment, and there's nothing else for you to do.

### Setting up a module

Some modules need extra credentials - for example, a contact form module might need email settings to send you notifications. After installation, any required settings appear as a checklist. Fill them in and save. Cactus applies the settings with another short rebuild.

---

## Enabling and disabling modules

You can switch a module off without removing it. A disabled module's features are hidden from visitors and its admin pages disappear from the sidebar - but all its data is preserved and ready to go if you enable it again.

To switch a module off, open its card's **…** menu on the **Installed** tab and choose **Turn off**. A module that is off shows a **Disabled** badge and its card offers **Enable** as its main button, so switching it back on is a single click.

---

## Updating a module

Cactus checks each installed module for updates once when you open the **Modules** page. While it's checking, the card says "Checking…" - this only takes a moment.

To check again straight away, use **Check for updates** at the top of the page (which rechecks the lot and refreshes the directory), or **Check for updates** in a single card's **…** menu. To avoid hammering GitHub, the automatic check only runs once every ten minutes per module - reopening the page within that window reuses what was last found rather than checking again. Asking for a check yourself always happens right away, ignoring that wait.

When a newer version is available the module gets an **Update available** badge and moves into the **Updates available** tab.

1. Click **Update to v…** on the card. **What's new** beside it shows the release notes first, if you'd like to know what you're getting.
2. Cactus installs the new version and triggers a short rebuild.
3. A progress screen keeps you updated.

If two or more modules all have updates waiting, an **Update all** button appears at the top of the page. Click it to install every pending update in one go - it's a single rebuild covering all of them, rather than one rebuild per module.

**Update all now checks compatibility one module at a time**, exactly as updating a single module has always done. A module that needs a newer version of Cactus than you're running, or another module you haven't installed, is left on its current version and reported back to you with the reason. The rest go ahead. Previously the bulk button took every latest version on trust, and one module wanting a newer Cactus could stop the site rebuilding at all - a bad afternoon for the sake of a convenience button.

Cactus also reads a module's requirements from the exact release it's about to install, rather than from whatever the module's authors have committed since. What you're told about a version is what that version actually says about itself.

### "An install is already in progress"

Only one install, update or removal can run at a time, which is why a second one is turned away with that message. If the first one was cut short - the odd occasion where the job is stopped mid-flight rather than finishing or failing properly - that hold used to stay put and nothing could be installed or updated again. Now anything left holding on for more than fifteen minutes is treated as abandoned and cleared automatically, so the next attempt simply works. Fifteen minutes is comfortably longer than any genuine install takes, rebuild included.

---

## Uninstalling a module

1. Go to **Modules → Installed** and find the module you want to remove.
2. Open its **…** menu and click **Uninstall**.
3. Choose what to do with the module's data:
   - **Remove code only** - the module is removed from your site, but all its stored data (posts, submissions, etc.) is kept in the database.
   - **Remove code and data** - the module and all its data are permanently deleted. This option is only available if the module supports it.
4. Confirm. A short rebuild completes the removal.

> **Heads up:** "Remove code and data" is permanent and cannot be undone. If you think you might reinstall the module later, choose "Remove code only" to keep your data safe.

### Bringing everything else along

Removing a module costs a rebuild just like installing one does, so the uninstall dialog makes the same offer. While it's open, Cactus has a quick look for anything else waiting and adds the tick boxes below the data choice, ticked by default:

- **Also update Cactus to v…** - shown when a Cactus update is waiting. As with installing, only offered if you're allowed to change settings.
- **Also update the modules with updates waiting** - shown when any of your *other* modules has a newer release. An update for the module you're removing is not offered, for reasons we hope are obvious.

The look takes a second, so you'll briefly see "Checking whether anything else is waiting to go out…". Confirm before it finishes and the removal simply goes out on its own, exactly as it always did. Nothing waiting means no tick boxes at all.

Everything ticked goes out in the same rebuild as the removal, so you wait once instead of three times. Each update is still checked for compatibility on its own: anything that isn't happy is left where it is and reported back with the reason, while the rest go ahead.

---

## Cactus's own update channel

Cactus itself (not the modules) is updated from **Settings → General**, which is covered on the [Configuration reference](Configuration-reference) page.

## Each module's update channel

Every installed module has its own update channel, set independently of every other module and of Cactus's own channel:

- **Finished releases** (default) - stable releases only.
- **Early (beta) releases** - stable releases plus pre-releases. Useful for trying a module's new features early, though they may have rough edges.

You'll find both under **Which releases** in each card's **…** menu on the **Installed** tab, with a tick against the one in force. Switching takes effect immediately - the next time Cactus checks that module for updates, automatically or because you asked, it checks against the newly chosen one.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Gazette](Gazette) · [Boards](Boards) · [Directory](Directory) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Product Attributes](Product-attributes) · [Shop Filters](Shop-filters) · [Product Discovery](Product-Discovery) · [Stock Imports](Stock-Imports) · [Google Shopping](Google-Shopping) · [Reply Catcher](Reply-catcher) · [Gemini Watermark Remover](Gemini-Watermark-Remover) · [Google Tag](Google-Tag) · [Ultimate SEO](Ultimate-SEO) · [UK Bookkeeping](UK-Bookkeeping) · [Purchase Orders](Purchase-Orders) · [Unified Inbox](Unified-Inbox) · [Configuration reference](Configuration-reference)
