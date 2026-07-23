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
> - an **API token** (recommended) - safer, because it's limited to managing Workers. There's a **Create a token** link that takes you straight to the right page; create a *Custom Token* with the permissions it lists. All of them, mind - the **Workers Scripts · Edit** one is what actually lets Cactus create the Worker, and leaving it off is the usual reason a deploy comes back complaining about authentication.
> - your **Global API Key** - simpler to find but it has full access to your whole Cloudflare account, so the token is the safer choice. There's a **Find your Global API Key** link too.
>
> **Setting it up a second time?** You don't need to dig any of it out again. Once a deploy has worked, Cactus remembers your Cloudflare credential and your storage credentials, and every field in the box goes optional - just click **Deploy Worker**. Fill a field in only when you actually want to change that value. (If you've only just saved a new storage password and haven't redeployed your site yet, Cactus will say so and point you at the Status tab, because passwords are stored write-only and it genuinely can't read them back until then.)
>
> Prefer to do it by hand? The same box has a **Prefer to set it up yourself?** section with step-by-step dashboard instructions, and there's more technical detail in [Self-hosting and operations](Self-hosting-and-operations).

---

## Uploading images

Once a provider is connected, an **Upload** button appears in:

- Any block with a picture in the page editor - **Image**, **Image + Floating Chips**, **Card**, plus the **Hero** (its background and side image) and any **Section** background - where the picker opens a window to choose an existing image, with a **+ Upload** button in its top corner for adding a new one. You pick from your library or upload on the spot, rather than pasting in a web address
- The **Site logo** settings in the page editor
- **Appearance → Styles → Branding** (for your logo and favicon)

Click **Upload** (or **+ Upload** in the picker window), select a file from your computer, and it will be stored with your chosen provider and added to your media library. In the block pickers the freshly uploaded image is popped in and selected for you straight away, so there's no need to nip off to the media library first.

In the media library the Upload button spells out where files will land (**+ Upload to Photos**, say), and as soon as you pick or drop files the **notification bell** pops open with a live progress list, showing each one filling up as it goes and ticking green when it's done. Files go up **six at a time** rather than in single file, so a few hundred photos take minutes rather than an afternoon, and one slow-moving file doesn't hold up the queue behind it. If one won't do - wrong sort of file, or a stray oversized SVG - it's flagged there and then with the reason, so nothing fails in silence. These upload entries sit above your usual notifications and don't count as unread - clear them with a click once you're done.

**File names:** whatever you called the file is what it's stored as. Upload `160cm-white-6-person-1.jpg` and that's the name it keeps, in your storage and in the web address it's served from - no scrambled prefix in front of it. Names are tidied on the way in: spaces and punctuation become hyphens, capitals become lower case, because web addresses are fussy about such things.

**If that name is already taken** in the folder you're uploading to, Cactus stops and asks rather than deciding for you:

- **Replace** - the file that's already there keeps its web address and everything pointing at it, and simply starts serving your new one. Handy for updating a photo you've used in a dozen places.
- **Keep both** - your upload goes in alongside it as `name-1`, with the suggested name shown on the button so there are no surprises.
- **Skip** - leave that one out and carry on with the rest.
- **Cancel** - abandon the rest of the batch.

The question is asked before a single byte leaves your computer, so nothing is overwritten or renamed behind your back.

**Supported formats:** JPEG, PNG, WebP, GIF, SVG, plus the 3D model formats GLB, glTF, OBJ, FBX and 3DS.

**File size:** photos (JPEG, PNG, WebP, GIF) upload straight to your storage, with a 50 MB ceiling - roomy enough for the full-fat shot from a phone or camera several times over. SVGs have a modest 4 MB ceiling, which they never trouble in real life. If you ever see a "too big" note on a photo well under 50 MB, your media connection just needs a quick refresh: pop to **Settings → Media** and redeploy. Should a file ever be refused, you'll get a plain message saying so, rather than it vanishing without a word.

The same 50 MB ceiling covers 3D model files. They go the same way photos do - browser straight to storage - and can be uploaded here in the media library as well as from a product's own 3D views tab, where [Product 3D views](Product-3D-views) files them with that product's pictures rather than off in a corner of their own. One thing worth knowing: 3D files need Cloudflare R2, Backblaze B2 or S3 storage with the media service deployed. On any other setup they'll be turned away with a note saying as much, rather than half-uploading and going quiet.

> **Worth doing once:** if you set your Worker up before this release, go to **Settings → Media** and click **Deploy Worker** again. The new one is stricter about what it will accept and hand back - it checks that an upload really is the image it claims to be, and it refuses to serve anything back as a web page. Older Workers keep working, they just don't have those guards.
>
> **Necessary, not merely worth doing, if you want 3D models.** A Worker deployed before this release will turn every 3D file away, because accepting them is new and your Worker only learns new things when you send it a fresh copy. Redeploy and they upload as normal. Photos are unaffected either way.
>
> **And once more, if you would rather people didn't help themselves to your 3D models.** A redeployed Worker will only hand out a model file to someone whose link carries a valid pass, and Cactus expires those passes after a day or so. Copied links go stale, and other websites can't point at your models at all. Photographs are deliberately left alone, so nothing else on your site changes. Until you redeploy, models are served to anyone who has the address - which is what every Worker did before now.

---

## Your media library

Everything you've uploaded lives in **Media**. Down the left is your **folder tree**, and the main area shows whatever's in the folder you're currently looking at, with a breadcrumb trail along the top so you always know where you are.

### The overview at a glance

Across the top sits a row of summary tiles, so you can see the state of your library without digging:

- **Files** - how many you've got, and how many folders you've sorted them into.
- **Storage used** - the total space everything is taking up.
- **Unused** - how many files nothing on your site points to, and how much space you'd get back by clearing them out. Click the tile to jump straight to those files. "Nothing points to it" covers the whole site, not just your pages: a product photo, an option or attribute swatch, a 3D model, a downloadable file, a board icon or an article's headline picture all count as in use.
- **Optimisable** - how many files could still be slimmed down (and how many you've already done). Photos and 3D models both count. Click it to line up exactly those files, ready for a tidy-up - the ones you've already done stay out of the way.

The Unused and Optimisable tiles light up while there's something worth doing, and clicking either one gathers the matching files from **every** folder in one place. The Optimisable list arrives with a **Still to optimise** chip above it, which you can lift at any time to see everything again.

If part of your site can't be checked for some reason, the library errs on the side of caution and reports nothing as unused at all, rather than pointing you at files that may well be in use.

All of these tiles are counted from Cactus's own records. If you want to know what your storage provider is really holding, see [Checking your storage](#checking-your-storage) at the bottom of the page.

### Finding things

Below that is a row of controls to help you find things in a hurry:

- A **search box** that looks inside the folder you're standing in, filtering as you type so you don't have to press Enter and wait. Next to it a small **In [folder name] / Everywhere** switch appears: leave it be to search where you are, or flip it to sweep the whole library. Searching a folder means that folder itself - files tucked away in folders inside it aren't counted, which is the same set you'd see by browsing it. If a search inside a folder comes up empty, the message offers a one-click **Search all folders**, and the little tag under the controls always says which of the two you're looking at.
- **Sort** - newest or oldest first, by name A-Z or Z-A, or largest to smallest.
- **File type** - show everything, just images, or just other files.
- **Usage** - show everything, only files that are in use, or only the ones nothing points to. "In use" means referenced somewhere real: on a page or layout, as your logo or favicon, as a page's social-sharing image, or as a member's avatar.
- **Tags** - narrow down to a single tag (see [Tags](#tags) below).
- A **view switch** on the right flips between a **grid** of thumbnails and a tidy **list** - the list is handy when you want to eyeball names, sizes and folders down a column, and you can sort it by tapping the Name, Size or Uploaded headings. Cactus remembers both your chosen view and sort order for next time.

Whenever a filter is on, a little tag appears under the controls spelling out what you're looking at ("Images only", "Not in use", and so on). Each has an × to lift just that one, or **Clear all** to start fresh. A small line above the files tells you how many there are, so you always know how big the set you're looking at is. If a search or filter turns up nothing, the empty message offers a one-click **Clear filters** to get everything back.

Each file carries a small **in use** dot (green) or unused (grey) marker. Files you've already slimmed down wear a green **✓ Optimised** badge, and any tags you've added show as little chips. Any photo that's missing its alt text gets a small **Alt?** flag in the corner, so gaps in your descriptions are easy to spot and fix. If a file's preview can't be loaded, you'll see a tidy placeholder rather than a broken-image icon.

Got a big library? Just keep scrolling - more files load in automatically as you go, no need to click through pages.

Hover over a thumbnail and a couple of quick buttons appear in its corner: **Optimise** (the little lightning bolt, on photos and 3D models that haven't been done yet) and **Copy link** - so the two things you reach for most aren't tucked away behind a right-click.

**Click any file** and a details panel slides in from the right. It shows the full picture along with the filename, file size, type, folder, and who uploaded it and when. From here you can edit its **alt text** - a short description used by screen readers and search engines - and tick **Decorative** for images that are purely for show and need no description. You can also edit its **tags** on the spot, step through your files with the arrow buttons (or the arrow keys) - and Cactus keeps loading more as you reach the end, so stepping through never hits a wall - and reach every action for that file in one place: **Open original**, **Copy link**, **Download**, **Optimise** (for photos and 3D models that haven't been), **Edit image…**, **Change ratio…**, **Resize…**, **Rename…**, **Move…**, **Cut**, **Copy** and **Delete**. Press Esc or click outside to close.

**Copy link** pops the file's web address onto your clipboard, ready to paste wherever you need it; **Download** saves the original back to your computer. Both are also on the right-click menu.

**Drag files straight in from your computer** - drop them anywhere on the library and they upload into whichever folder you're viewing, no need to click Upload first. You can also drop them straight onto a folder in the tree on the left to upload into it without opening it first.

**Right-click an empty patch** of the library (not on a file) for a handy menu to **paste**, **upload**, make a **new folder** or **select all** - so pasting no longer needs a file to aim at.

A few **keyboard shortcuts** if you like to move quickly: Ctrl/Cmd+A selects everything on show, Ctrl/Cmd+X cuts and Ctrl/Cmd+C copies your selection, Ctrl/Cmd+V pastes whatever you've cut or copied, Delete removes what's selected (with the usual confirmation), and Esc clears your selection.

When you've got a few files selected, a **Copy links** button on the selection bar puts all their web addresses on your clipboard at once, one per line - handy for pasting a batch into an email or a spreadsheet.

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

## Replacing a file

New photo of the same product? Logo redrawn? A typo spotted in a graphic after it went up in nine places? **Replace** swaps the file for a fresh one while keeping the item itself, so everything already pointing at it carries on pointing at it and simply shows the new picture.

You'll find it three ways:

- Hover any tile in the grid and click the **🔄** button.
- Right-click a file and choose **Replace file…**.
- Open a file's preview and use **Replace file…** in the action row.

Pick your new file and that's it. The item keeps its name, its folder, its alt text and its tags - only the picture changes. Every page, product and setting using it updates in one go, with nothing to go round and re-point by hand.

This is the bit worth knowing: it's *not* the same as uploading the new file and deleting the old one. That way round, every page still holding the old file goes blank, and you get to find each one yourself. Replacing keeps them all working.

A couple of things to expect:

- **There's no undo.** The old file is gone from your storage once the new one is in. If you might want it back, download it first.
- **Big files are fine** - the same generous limit as a normal upload, with a progress bar in the notification bell while it goes up.
- **Occasionally Cactus will say no**, and it'll tell you why. Some pictures are filed under a fixed name by another part of your site - product photos, most often - and for those the replacement has to be the same type of file as the original: a JPEG for a JPEG, a PNG for a PNG. Swapping the type would move the file to a new address that the shop wouldn't know to follow, and your product photo would quietly vanish from the storefront while sitting perfectly safe in your library. Easier to say no up front. Save the new picture in the matching format and it'll go straight through.

If what you actually want is a *changed* version of the picture you've already got - trimmed, reshaped, or scaled down - the next three sections do that without you leaving Cactus at all.

---

## Cropping and editing images

Need to trim an image down or reframe it? **Edit image…** opens a built-in crop tool - no need to fire up Photoshop for a quick tidy-up. You'll find it two ways: right-click any picture, or open its preview and use the button in the action row. (It only shows for photos - the sort of vector logo that scales to any size has nothing to crop.)

Drag the corners or edges of the box to choose the part you want to keep; drag from the middle to slide the whole box around. The bit you're cutting away dims so you can see exactly what you'll be left with.

- **Preset shapes** - tap **1:1** for a perfect square, **16:9** for a widescreen banner, or any of the other common ratios (**3:2**, **4:3**, **2:3**, **3:4**, **9:16**). The box then keeps that shape however you resize it.
- **Your own shape** - pop your own numbers into the two ratio boxes (say `5` and `4`) and press **Apply** to lock the crop to that.
- **Free-form** - or leave it on **Free** and crop to whatever suits.

When you're happy, you've two ways to save:

- **Save (replaces original)** swaps the cropped version in for the old one *everywhere it's used on your site* - pages, logos, everywhere. The file keeps its name and its place in your folders, so anything pointing at it carries on pointing at it. It's a genuine replacement with no undo, so Cactus asks you to confirm first.
- **Save as new…** keeps the original exactly as it was and tucks a fresh, cropped copy into the same folder. It'll suggest a name (the original plus "(edited)"), which you're free to change.

---

## Changing an image's shape

Sometimes you don't want to lose any of the picture - you just want it to *fit*. A gallery that wants neat squares, a banner slot that wants widescreen, a set of product shots that arrived in six different shapes. That's **Change ratio…**, and you'll find it in the same two places as the crop tool: right-click any picture, or open its preview and use the button in the action row.

Here's the honest bit, because it explains everything about how this works. A picture can't change shape without one of three things happening: you cut bits off, you squash it, or you add space around it. The crop tool above is the "cut bits off" option, and squashing is nobody's friend. So **Change ratio adds space**. Your picture arrives at the new shape completely untouched - nothing trimmed, nothing stretched - sitting in the middle of a little more room than it had before.

Pick your shape - **1:1** for a square, **16:9** for a widescreen banner, or any of **3:2**, **4:3**, **2:3**, **3:4** and **9:16**. Fancy something else entirely? Put your own numbers in the two boxes.

Then choose what fills the new space:

- **Blurred image** - a soft, out-of-focus blow-up of the picture itself, sitting behind it. It's the one to reach for nine times out of ten: it fills the gap without announcing that there was a gap.
- **Colour** - a flat colour of your choosing, with **White** and **Black** a click away. Best when your page background is a known colour and you want the padding to vanish into it.
- **Transparent** - no fill at all, so whatever's behind it on the page shows through. Only offered when the picture can actually hold transparency; JPEGs can't, so for those it's greyed out (a "transparent" JPEG would just come out black, which helps nobody).

A preview shows you exactly what you'll get before you commit. Then save the same two ways as the crop tool: **a new image**, which leaves your original alone, or **replace the original**, which swaps it in everywhere it's used on your site - no undo, so you'll be asked to confirm. Replacing keeps the file's name exactly as it was, which matters more than it sounds: a reshaped product shot is still the same file your shop is pointing at, so it stays on the page.

> **One thing worth knowing.** Because the file keeps its name, browsers that have already downloaded it may hang on to the copy they've got for a while. If you've reshaped a picture and still see the old shape, give the page a hard refresh - your visitors will pick up the new one as their own copy expires.

### Doing a whole batch at once

Tick as many pictures as you like - or use the select-all box - and **Change ratio…** appears in the bar along the top. Choose the shape and the fill once, and every selected picture gets the same treatment.

A few sensible things happen without you asking:

- **Anything already the right shape is left well alone** rather than needlessly re-saved.
- **One awkward file won't spoil the batch.** If a picture can't be reshaped, the rest still go through and the toast tells you how many were done and how many weren't.
- **Six at a time, counted off as it goes.** The button shows how far along it is, so a few hundred pictures don't leave you staring at a spinner wondering whether anything is happening.
- **Saving as new copies** gives each one a name based on the original plus the ratio, so forty files don't all fight over the same name.
- **Very extreme shapes** - a long thin panorama forced into a tall portrait, say - would technically need an enormous canvas of mostly empty space, so Cactus quietly scales the whole thing to something sensible. The picture keeps its proportions; it just doesn't become a 60-megapixel monument to padding.

---

## Resizing images

Modern phones and cameras produce enormous pictures. A photo straight off a decent phone can be 4000 pixels wide, which is roughly four times more than any website will ever show and rather more than your visitors want to download. **Resize…** makes the picture smaller - the actual picture, not just how it's displayed. You'll find it in the same places as everything else: right-click any picture, or open its preview and use the button in the action row.

Where **Change ratio** above changes an image's *shape*, resizing keeps the shape exactly as it is and changes the *size*. Nothing is cropped and nothing is squashed - the whole picture is simply scaled down.

Pick how big you want it: **Extra large** (2400px), **Large** (1600px), **Medium** (1000px) or **Small** (600px). Those numbers are the longest edge, so a landscape photo and a portrait one both come out sensibly sized without you having to think about which way round it is. Want something specific? Type a width, a height, or both into the boxes. Leave one blank and it simply follows along, keeping the proportions.

For a single picture, Cactus tells you what you're getting before you commit - the size it is now, and the size it's about to become.

> **Resizing only ever makes pictures smaller.** Ask for a 2400px version of a 900px picture and Cactus will tell you it already fits and leave it alone. Blowing an image up doesn't add detail that was never there; it just makes a bigger file that looks worse. If you need a genuinely larger version, you need the original.

Save it the same two ways as everything else: **a new image**, which leaves your original untouched, or **replace the original**, which swaps it in everywhere it's used - no undo, so you'll be asked to confirm first. Replacing keeps the filename exactly as it was, so anything already pointing at that picture carries on working. The same cache note from the ratio tool applies: if you've replaced a picture and still see the old one, give the page a hard refresh.

### Doing a whole batch at once

Tick as many pictures as you like and **Resize…** appears in the bar along the top. Set the size once and every selected picture gets it, each measured on its own merits:

- **Anything already smaller than the size you picked is left alone**, not needlessly re-saved.
- **One awkward file won't spoil the batch.** The rest still go through, and the toast tells you how many were done and how many weren't.
- **Six at a time, counted off as it goes.** The button shows how far along it is, so a big pile of holiday photos doesn't leave you guessing.
- **Saving as new copies** names each one after the original plus its new size, so nothing fights over the same name.
- **The toast tells you how much space you saved**, which on a folder of holiday photos is usually the most satisfying number in this entire admin area.

This pairs nicely with **Optimise** further down: resizing throws away pixels nobody was looking at, optimising squeezes what's left. Doing both to a stack of camera photos routinely takes a page from unpleasant to instant.

Order doesn't matter. Resize a picture you've already optimised and it keeps its green **✓ Optimised** badge, because the smaller copy comes out of the same wash and is smaller still. You won't be nagged to do a job that's already done.

---

## Cut, copy and paste

Right-click any file for a familiar **Cut**, **Copy** and **Paste** menu - handy for shuffling things between folders.

- **Cut** then **Paste** *moves* the files into the folder you're viewing (cut files look faded until you paste them).
- **Copy** then **Paste** makes a *duplicate* in the folder you're viewing, leaving the original where it was.

Select several files first and the whole lot travels together. You can also cut, copy and paste from the bar that appears when you've got files selected.

---

## Tags

Folders put a file in one place; **tags** let you label it with as many keywords as you like - "hero", "winter-campaign", "team" - so you can round up related images no matter which folder they live in.

Click a file to open its details panel (or right-click and choose **Tags…**, which opens the same panel). In the **Tags** section, type a word and press Enter to add it; start typing and Cactus suggests tags you've used before so you keep them consistent. Remove one with the little × on its chip, then press **Save tags**. Once you're using tags, the **Tags** filter above the library lets you show just the files carrying a particular one.

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

## Loading images only when they're needed

At the bottom of **Settings → Media** there's a switch: **Load images only as visitors scroll to them**. It's on to begin with, and for almost every site that's where it should stay.

With it on, pictures wait until a visitor is nearly scrolled to them before they're fetched. Nobody downloads the eight photos at the bottom of a page they abandoned after the first paragraph - which is most people, most of the time.

This applies to **every** picture on your pages: the images in your content, the photos in quotes, the pictures on cards and panels, and logo strips.

That includes the big picture at the top, and it's worth knowing what that means. The image at the top of a page is the one visitors are actually waiting to see, and asking the browser to hold off on it can make the page *feel* slower to arrive even though it's doing less work overall. If the top of your pages feels sluggish, this switch is the first thing to try turning off.

Turn it off and every image on a page is fetched immediately, whether anyone scrolls that far or not. More work for your visitors' connection and more traffic on your storage bill, but the top of the page appears without hesitation. It's your site, and this is the trade.

> Images added by modules - a shop's product pictures, say - follow their own module's rules rather than this switch.

---

## Deleting media

Deleting an image via the admin removes it from your storage provider immediately. There is no recycle bin or undo. If you need a deleted image back, you'll need to re-upload it or restore from a backup.

If the image is still in use somewhere - a page, a layout, your logo, and so on - Cactus won't let you delete it by accident, and tells you where it's being used. Swap it out or remove it there first, then delete.

### Deleting several at once

Tick the small checkbox in the corner of each thumbnail (or the tick-boxes in the list view) to select more than one file. A bar appears above the library telling you how many you've picked, with a **Delete** button. Confirm in the pop-up and they're gone.

Got a long run of files to bin? Tick the first one, then hold **Shift** and tick the last one - everything in between gets picked too.

If any of your selection turns out to be in use somewhere, Cactus holds those back and tells you where - you can then choose **Delete anyway** if you're sure, or back out and go and unlink them first.

---

## Checking your storage

Everything else on the media page is counted from Cactus's own records, so it can only ever agree with itself. The **Storage check** at the bottom of the page is the one thing that goes and asks your storage provider what is actually sitting there, and reports the difference. You'll only see it if you're allowed to manage settings.

Press **Run check**. It can take a little while on a big library, because it genuinely reads through everything your provider holds. Then it tells you about three things:

- **Leftover files** - files sitting in storage that no item in your library points to, along with how much room they're taking up. These are the usual reason your provider's own dashboard reports more files than your library does. They build up in small ways: a file gets replaced or moved and the old copy doesn't quite get cleared away.
- **Files that have gone** - the opposite problem. An item shows in your library but its actual file is no longer in storage, which is why it appears as a broken picture. Usually because someone tidied up in the provider's own dashboard: deleting a file there tells Cactus nothing, so the entry stays behind.
- **Sizes recorded wrongly** - where Cactus has the wrong size written down for a file. Harmless in itself, but it makes the "Storage used" figure on this page slightly out.

All three you can put right on the spot. **Correct these** rewrites the wrong sizes to match the real files, and changes nothing else. **Delete all leftovers** removes the stray files from storage and tells you how much room you got back. That one asks you to confirm first, and only appears if you're allowed to delete media, because nothing in your library points at those files to vouch for them. It is not undoable from here.

**Remove these entries** clears out the items whose file has gone. Nothing is deleted from your storage by this - the file went long ago - it only tidies away the entries left pointing at thin air. Anything still used on a page is left alone and listed for you instead, so you can see what needs a new picture before you commit. If you'd rather have them gone regardless, there's a second button for that, and the spots they filled will simply be empty until you put something else there.

Big clean-ups - hundreds of entries or leftover files at once - are worked through in batches, with a running count shown as it goes. If a batch stumbles along the way it's quietly retried a couple of times before the check admits defeat, so a wobbly connection doesn't send you back to square one.

If you'd sooner keep an item and get its picture back, use **Replace file** on it instead and upload a fresh copy over the top.

If some of your storage can't be read, the check says so plainly rather than pretending it found nothing. That matters most if you use Cloudinary or ImageKit, which file things under references they invent themselves, so their contents can't be lined up against your library this way.

### Why your provider's dashboard shows a bigger number

If you look at your storage provider's own file browser, it may well report several times as many files, and a great deal more space, than your library does. That usually isn't a fault.

Most providers keep the previous copy of a file for a while after it's replaced, and leave a small marker behind when one is deleted. Their file browser counts all of that. So a spell of tidying up, renaming or reorganising can briefly triple the numbers on their dashboard while your library stays exactly the same size. Providers generally have a housekeeping setting that clears the old copies out automatically after a day or so. If yours does, it's worth having it switched on, and the numbers will settle by themselves.

The Storage check ignores all of that and looks only at the current version of each file, which is why it's the figure to trust.

---

## Optimising images and 3D models

Photos straight off a phone or a designer's machine are often far heavier than they need to be, and heavy images make pages slow to load. The media library can slim them down for you. The same goes for 3D models, which are heavier again - see [Slimming down 3D models](#slimming-down-3d-models) below.

Open any un-optimised photo and its details panel has an **Optimise** button (it's on the right-click menu too). Press it and Cactus re-saves the image in a leaner modern format (WebP), keeping the same dimensions and near-identical quality but usually at a fraction of the file size. The original is tidied away and the slimmer version takes its place everywhere it was already being used - pages, layouts, your logo, avatars - so nothing on your site breaks. Your file keeps the name you gave it, too; only the bit after the dot changes, because the picture genuinely is a WebP now. Once done, the image picks up a green **✓ Optimised** badge so you know it's been through the wash.

Not sure where to start? The **Optimisable** tile at the top of the library tells you how many photos are still worth doing and, with a click, rounds them all up for you.

### Doing several at once

Tick the checkbox in the corner of each thumbnail (or tick the first, hold **Shift**, and tick the last to grab a whole run - the list view has tick-boxes too, and a "select all" box at the top), then press **Optimise** in the bar that appears above the library. Cactus works through six at a time and counts them off as it goes - "Optimising 214/600" - so a big batch tells you it's getting on with it rather than sitting there silently. At the end it says how many it slimmed down and roughly how much space you saved.

Doing several at once is genuinely faster than doing them one after another, which matters once you're into the hundreds: a batch that used to take an age now gets through it in a fraction of the time, and a very large selection no longer risks giving up part-way through.

A few sensible rules keep things safe:

- **Logos and icons in the SVG format are left alone** - they're already tiny and shrinking them would do more harm than good.
- **Anything already as small as it's going to get** is skipped rather than made bigger, and marked as optimised so you're not offered it again.
- Optimising is a one-way tidy-up - the heavier original isn't kept - but since the picture stays visually the same, there's rarely a reason to want it back.

### Already slimmed them down yourself?

Plenty of people optimise their pictures on their own computer before uploading them, particularly for a big batch. Cactus has no way of knowing that has happened, so it will cheerfully offer to do the job all over again.

You can put it straight. Select the files and press **Mark as optimised** in the bar above the library, or use the button on a single file's details panel - it's on the right-click menu too. The files themselves aren't touched: nothing is re-saved, the picture doesn't change and neither does its name. All it does is tell the library to stop asking. The green **✓ Optimised** badge appears, and the **Optimisable** tile stops counting them.

Marked something by mistake? Select it again and the same button now reads **Mark as not optimised**, which puts it back on the list. Nothing is lost either way, which is rather the point of letting you say it in the first place.

To be clear, pressing **Optimise** on a picture that genuinely is already as small as it gets does no harm at all - Cactus re-saves it, finds it can't do better, leaves your original exactly where it was and ticks it off. Marking simply spares you the wait, which on a few hundred files is a wait worth sparing.

### Slimming down 3D models

If you use the Product 3D views module, your 3D models sit in the media library alongside everything else - and they are comfortably the heaviest files on the site. A model straight out of a design tool routinely carries duplicate copies of the same part, materials left behind by things that were deleted, and textures at four times the detail any screen can actually show. Every shopper who opens that product downloads the lot.

**New models are slimmed down automatically.** Upload one and Cactus compresses it on the way in, so it arrives wearing the same green **✓ Optimised** badge your photos do. There is nothing to remember and nothing to press.

**Models you uploaded before this existed** get the same **Optimise** button as everything else - on the file's details panel, on the right-click menu, and as the little lightning bolt when you hover its thumbnail. The **Optimisable** tile at the top of the library counts them in with your photos, so one click rounds up everything still worth doing and the selection bar's **Optimise** button works through the lot six at a time.

The saving is usually substantial - often more than half the file, sometimes a good deal more - and the model looks exactly the same. Nothing is simplified, smoothed or thrown away: it is the same shapes and the same materials, packed far more sensibly, with textures brought down to a size a screen can genuinely resolve. Shoppers get a product that appears in a fraction of the time, particularly on a phone.

A few things worth knowing:

- **GLB files are the ones that get slimmed.** They are the format we recommend anyway (see the Product 3D views guide), because a GLB carries everything it needs in one file. Models in the OBJ, FBX and 3DS formats are left exactly as they are - there is no equivalent tidy-up for them, and pretending otherwise would risk the file for nothing.
- **A model keeps its place.** Unlike a photo, which changes format and picks up a new extension, a slimmed model is written straight back over itself - so every product and variation pointing at it carries on pointing at it, with nothing to relink.
- **If it can't be slimmed, nothing is lost.** A model that was already tight, or that the tidy-up couldn't finish, is stored exactly as you uploaded it and simply keeps its **Optimise** button for another day. An upload never fails because of this.

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
