# Managing media

Cactus stores your images and files with a cloud storage provider. Before you can upload anything, you need to connect a provider in **Settings → Media**.

---

## Choosing a storage provider

Go to **Settings → Media** and pick a provider from the dropdown. The options are:

| Provider | Good for |
|----------|----------|
| **Vercel Blob** | The simplest option if you're already on Vercel. No extra accounts needed. |
| **Cloudflare R2** | No charges for delivering images to visitors. A great choice if you're already using Cloudflare. |
| **Backblaze B2** | Very affordable and reliable. |
| **AWS S3** | The most established option, with a huge ecosystem. |
| **DigitalOcean Spaces** | Straightforward and well-priced. |
| **Wasabi** | Low cost, no delivery charges. |
| **Supabase Storage** | Good if you're already using Supabase for other things. |
| **Cloudinary** | Handles image delivery and resizing itself. No Cloudflare Worker needed. |
| **ImageKit** | Similar to Cloudinary - images served from their own delivery network. |

Enter the credentials for your chosen provider and click **Save**. Cactus will trigger a short rebuild (usually under two minutes) to apply the new settings. A progress screen keeps you updated.

Not sure where a particular value comes from? The credentials panel shows a **Where to find these** row with links straight to the right page in your provider's console - the bucket list, the key-generation screen, and so on. No hunting through their dashboard required.

> **Note:** Most providers (all except Cloudinary and ImageKit) deliver images via a Cloudflare Worker - a tiny free program that resizes and serves your images. You don't have to build it by hand. The credentials panel has a **Set up the Worker automatically** box: paste one Cloudflare credential, click **Deploy Worker**, and Cactus creates and configures it for you. No terminal, no code.
>
> If your site's domain is in the same Cloudflare account, Cactus goes one better and serves your images from a tidy address on your own domain - `media.your-site` - instead of a long Cloudflare `workers.dev` one, and moves any images you've already uploaded across to it. If the domain is managed somewhere else, it quietly falls back to the standard Cloudflare address and tells you why. Redeploy your site afterwards to switch over; the secure certificate for the new address can take a minute to go live.
>
> You'll need a (free) Cloudflare account and one of:
> - an **API token** (recommended) - safer, because it's limited to managing Workers. There's a **Create a token** link that takes you straight to the right page; create a *Custom Token* with the permissions it lists.
> - your **Global API Key** - simpler to find but it has full access to your whole Cloudflare account, so the token is the safer choice. There's a **Find your Global API Key** link too.
>
> Prefer to do it by hand? The same box has a **Prefer to set it up yourself?** section with step-by-step dashboard instructions, and there's more technical detail in [Self-hosting and operations](Self-hosting-and-operations).

---

## Uploading images

Once a provider is connected, an **Upload** button appears in:

- Any block with an image picker in the page editor - **Image**, **Image + Floating Chips**, and **Card** - where the picker opens a window to choose an existing image, with a **+ Upload** button in its top corner for adding a new one
- The **Site logo** settings in the page editor
- **Appearance → Styles → Branding** (for your logo and favicon)

Click **Upload** (or **+ Upload** in the picker window), select a file from your computer, and it will be stored with your chosen provider and added to your media library. In the block pickers the freshly uploaded image is popped in and selected for you straight away, so there's no need to nip off to the media library first.

**Supported formats:** JPEG, PNG, WebP, GIF, SVG.

---

## Your media library

Everything you've uploaded lives in **Media**. Down the left is your **folder tree**, and the main area shows whatever's in the folder you're currently looking at, with a breadcrumb trail along the top so you always know where you are.

Above the files sits a row of controls to help you find things in a hurry:

- A **search box** that looks across every folder, not just the one you're in.
- **Sort** - newest or oldest first, by name A-Z or Z-A, or largest to smallest.
- **File type** - show everything, just images, or just other files.
- **Usage** - show everything, only files that are in use, or only the ones nothing points to. "In use" means referenced somewhere real: on a page or layout, as your logo or favicon, as a page's social-sharing image, or as a member's avatar.
- **Tags** - narrow down to a single tag (see [Tags](#tags) below).

Each file carries a small **In use** or **Unused** label. Files you've already slimmed down wear a green **✓ Optimised** badge, and any tags you've added show as little chips underneath.

Got a big library? Just keep scrolling - more files load in automatically as you go, no need to click through pages.

**Click any thumbnail** to open a larger preview. It shows the full picture along with the filename, file size, type, alt text, and who uploaded it and when. From here you can also **Edit image…**, **Cut**, **Copy**, **Rename…**, **Move to…**, **Tag…** or **Delete** the file, without having to close the preview and hunt for the right-click menu first. Press Esc or click outside to close.

**Drag files straight in from your computer** - drop them anywhere on the library and they upload into whichever folder you're viewing, no need to click Upload first.

A word of caution: "Not In Use" means nothing on your site links to it *right now*. If you've saved an image's address somewhere Cactus can't see - pasted into a third-party tool, say - it'll still show as unused. So have a quick think before deleting anything you don't recognise.

---

## Organising with folders

Folders keep a growing library tidy - one for logos, one for blog photos, one for that client's product shots, however you like to work.

- **Make a folder** with the **+ New folder** button at the bottom of the folder tree. It's created inside whichever folder you're currently viewing, so you can nest them as deep as you like.
- **Open a folder** by clicking its name in the tree, or a step in the breadcrumb trail to hop back up.
- **Rename or delete a folder** using the small pencil and bin icons that appear beside its name in the tree.
- **Upload straight into a folder** by opening it first, then clicking **Upload** - the new files land right there.

**Drag and drop** is the quickest way to file things away: grab any thumbnail and drop it onto a folder in the tree (or onto a step in the breadcrumb). Selected several files first? Dragging any one of them carries the whole selection along.

**Reorganise whole folders** the same way - drag a folder in the tree onto another folder to nest it there, or drop it on **Media** at the top to move it back to the root. Everything inside travels with it.

> **Careful with deleting folders.** Deleting a folder is permanent and takes *everything* inside it with it - every file and every subfolder, removed from your storage for good. Before it does anything, Cactus shows you exactly how much it's about to remove and warns you by name about any files that are still in use on your site. There's no undo, so read that summary before you confirm.

---

## Renaming and moving files

- **Rename a file** by right-clicking it and choosing **Rename…**. The new name flows through to everywhere the file is used, so nothing on your site breaks.
- **Move files** either by dragging them onto a folder, or by selecting them and choosing **Move to…** (from the right-click menu or the selection bar) and picking a destination.

If a file you're moving or renaming would end up with the same name as one already in the destination, Cactus stops and asks what to do: **Keep both** (it adds a number, so `logo.png` becomes `logo (1).png`), **Replace** the existing one, or **Skip** it and leave things be.

---

## Cropping and editing images

Need to trim an image down or reframe it? **Edit image…** opens a built-in crop tool - no need to fire up Photoshop for a quick tidy-up. You'll find it two ways: right-click any picture, or open its preview and use the button in the action row. (It only shows for photos - the sort of vector logo that scales to any size has nothing to crop.)

Drag the corners or edges of the box to choose the part you want to keep; drag from the middle to slide the whole box around. The bit you're cutting away dims so you can see exactly what you'll be left with.

- **Preset shapes** - tap **1:1** for a perfect square, **16:9** for a widescreen banner, or any of the other common ratios (**3:2**, **4:3**, **2:3**, **3:4**, **9:16**). The box then keeps that shape however you resize it.
- **Your own shape** - pop your own numbers into the two ratio boxes (say `5` and `4`) and press **Apply** to lock the crop to that.
- **Free-form** - or leave it on **Free** and crop to whatever suits.

When you're happy, you've two ways to save:

- **Save (replaces original)** swaps the cropped version in for the old one *everywhere it's used on your site* - pages, logos, everywhere. It's a genuine replacement with no undo, so Cactus asks you to confirm first.
- **Save as new…** keeps the original exactly as it was and tucks a fresh, cropped copy into the same folder. It'll suggest a name (the original plus "(edited)"), which you're free to change.

---

## Cut, copy and paste

Right-click any file for a familiar **Cut**, **Copy** and **Paste** menu - handy for shuffling things between folders.

- **Cut** then **Paste** *moves* the files into the folder you're viewing (cut files look faded until you paste them).
- **Copy** then **Paste** makes a *duplicate* in the folder you're viewing, leaving the original where it was.

Select several files first and the whole lot travels together. You can also cut, copy and paste from the bar that appears when you've got files selected.

---

## Tags

Folders put a file in one place; **tags** let you label it with as many keywords as you like - "hero", "winter-campaign", "team" - so you can round up related images no matter which folder they live in.

Right-click a file and choose **Tags…**. Type a word and press Enter to add it; start typing and Cactus suggests tags you've used before so you keep them consistent. Remove one with the little × on its chip. Once you're using tags, the **Tags** filter above the library lets you show just the files carrying a particular one.

---

## Using images in pages

1. In the page editor, drag an **Image** block onto your page.
2. Click the block to open its settings.
3. Click the media picker to choose an image you've already uploaded, or upload a new one.
4. Add alt text (a short description of the image - important for accessibility and search engines).

---

## Switching providers

You can switch to a different provider at any time from **Settings → Media**.

When you switch:
- **New uploads** go to the new provider immediately.
- **Existing images** stay where they are and continue to display correctly.

To move existing images to the new provider, click **Migrate now** on the Media settings page. Cactus moves everything across in batches while you wait. You can see a breakdown of how many images are on each provider before you decide.

---

## Deleting media

Deleting an image via the admin removes it from your storage provider immediately. There is no recycle bin or undo. If you need a deleted image back, you'll need to re-upload it or restore from a backup.

If the image is still in use somewhere - a page, a layout, your logo, and so on - Cactus won't let you delete it by accident, and tells you where it's being used. Swap it out or remove it there first, then delete.

### Deleting several at once

Tick the small checkbox in the corner of each thumbnail to select more than one file. A bar appears above the library telling you how many you've picked, with a **Delete selected** button. Confirm in the pop-up and they're gone.

Got a long run of files to bin? Tick the first one, then hold **Shift** and tick the last one - everything in between gets picked too.

If any of your selection turns out to be in use somewhere, Cactus holds those back and tells you where - you can then choose **Delete anyway** if you're sure, or back out and go and unlink them first.

---

## Optimising images

Photos straight off a phone or a designer's machine are often far heavier than they need to be, and heavy images make pages slow to load. The media library can slim them down for you.

Every un-optimised photo in the library shows an **Optimise** button. Press it and Cactus re-saves the image in a leaner modern format (WebP), keeping the same dimensions and near-identical quality but usually at a fraction of the file size. The original is tidied away and the slimmer version takes its place everywhere it was already being used - pages, layouts, your logo, avatars - so nothing on your site breaks. Once done, the image picks up a green **✓ Optimised** badge so you know it's been through the wash.

### Doing several at once

Tick the checkbox in the corner of each thumbnail (or tick the first, hold **Shift**, and tick the last to grab a whole run), then press **Optimise selected** in the bar that appears above the library. Cactus works through them one by one and tells you how many it slimmed down and roughly how much space you saved.

A few sensible rules keep things safe:

- **Logos and icons in the SVG format are left alone** - they're already tiny and shrinking them would do more harm than good.
- **Anything already as small as it's going to get** is skipped rather than made bigger, and marked as optimised so you're not offered it again.
- Optimising is a one-way tidy-up - there's no "un-optimise" - but since the picture stays visually the same, there's rarely a reason to want one.

---

## Branding (logo and favicon)

Your site logo and favicon are uploaded in **Appearance → Styles → Branding**.

- The **logo** appears wherever you've placed a **Site logo** block in the header, footer, or a page.
- The **favicon** appears in the browser tab.

Both require a media provider to be configured first.

Upload one square **App icon** and Cactus generates the whole set for you - browser favicon, Apple touch icon, and the icons used when someone installs your site as an app. Underneath, a small preview shows exactly where each one turns up: a browser tab, an iPhone home screen, an Android home screen, and the installed app's loading screen - so you can see what you're getting before you save.

### Optimising your logo

Once a logo is uploaded, an **Optimise** button appears next to it. Press it and Cactus will shrink an oversized logo down to a sensible size and compress it, without any loss of quality (the picture stays pixel-for-pixel identical). It tells you how much smaller the new version is (for example, `240 KB → 38 KB`) and swaps it in automatically. Press **Save changes** afterwards to keep it.

It is worth doing if your logo started life as a large file straight off a designer's machine, since a lighter logo means faster page loads. If your logo is already small, Cactus simply leaves it alone.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Configuration reference](Configuration-reference)
