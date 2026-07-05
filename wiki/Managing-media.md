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

- The **Image** block settings in the page editor
- The **Site logo** settings in the page editor
- **Settings → Branding** (for your logo and favicon)

Click **Upload**, select a file from your computer, and it will be stored with your chosen provider and added to your media library.

**Supported formats:** JPEG, PNG, WebP, GIF, SVG.

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

---

## Branding (logo and favicon)

Your site logo and favicon are uploaded in **Settings → Branding**.

- The **logo** appears wherever you've placed a **Site logo** block in the header, footer, or a page.
- The **favicon** appears in the browser tab.

Both require a media provider to be configured first.

### Optimising your logo

Once a logo is uploaded, an **Optimise** button appears next to it. Press it and Cactus will shrink an oversized logo down to a sensible size and compress it, without any loss of quality (the picture stays pixel-for-pixel identical). It tells you how much smaller the new version is (for example, `240 KB → 38 KB`) and swaps it in automatically. Press **Save changes** afterwards to keep it.

It is worth doing if your logo started life as a large file straight off a designer's machine, since a lighter logo means faster page loads. If your logo is already small, Cactus simply leaves it alone.

---

**Wiki:** [Home](Home) · [Managing pages](Managing-pages) · [Appearance and design](Appearance-and-design) · [Managing users](Managing-users) · [Managing media](Managing-media) · [Modules](Modules) · [Configuration reference](Configuration-reference)
