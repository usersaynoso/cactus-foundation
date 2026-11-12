# ChatGPT Product Feed

Gives ChatGPT a list of everything your shop sells, in the format OpenAI's merchant tools ask for, so the products can turn up when someone asks ChatGPT to find them something. Every variation is its own product - its own price, photos, stock and link - grouped under its listing, so a search for the exact size and colour finds the exact size and colour you sell.

Needs the [Shop](Shop) and [Shop Variations](Shop-variations) modules.

Module repo: [cactus-foundation-modules/ChatGPT-Product-Feed-for-Shop](https://github.com/cactus-foundation-modules/ChatGPT-Product-Feed-for-Shop)

---

## Where it lives

**Settings > ChatGPT product feeds** (`/hq/config?tab=chatgpt-product-feeds`, using your own admin path). Needs the `shop.manage` permission.

## Getting it running

1. Install the module from **Modules**.
2. Open **Settings > ChatGPT product feeds**, tick **Serve the product feed**, and save.
3. Press **Check the feed**. It builds the feed exactly as ChatGPT would get it and lists anything left out, and why.
4. Pick a format (CSV unless you have been told otherwise), copy the address, and give it to ChatGPT in its merchant tools.

The feed is built fresh from the shop every time it is collected, so prices, stock and photos always match the storefront. **Last collected** on the tab shows when something last downloaded it, how many products it got and what it called itself.

## The address

```
https://<your site>/api/m/chatgpt-product-feed-for-shop/public/feed/<file>?key=<secret>
```

`<file>` picks the format - all six carry the same products:

| File | Format |
|---|---|
| `products.csv` | CSV (the default; what OpenAI's guides walk through) |
| `products.csv.gz` | CSV, gzip-compressed |
| `products.tsv` / `products.tsv.gz` | Tab-separated |
| `products.jsonl` / `products.jsonl.gz` | JSON Lines, one product per line |

The `key` is a secret minted when the tab is first opened. Anyone with the address can download your catalogue, so keep it to yourself. **Make a new address** replaces the key and cuts the old address off straight away - ChatGPT then needs the new one.

Any wrong request answers a plain 404: feed switched off, wrong key, unknown file name, shop closed, or prices hidden (a quote-only shop has no price to send, and price is required).

OpenAI's own file-upload guide describes pushing the file to them over SFTP. This module serves the file at an address instead - it does not push anywhere. If your OpenAI account only offers SFTP, download the file from the address and upload it.

## What each product carries

Built to [OpenAI's product file specification](https://developers.openai.com/commerce/specs/file-upload/products).

| Field | Where it comes from |
|---|---|
| `item_id` | The variation's own product id (or the product's, with no variations). Stable. |
| `group_id`, `listing_has_variations`, `variant_dict` | Variations only: the listing's id, and the chosen options, e.g. `{"Finish":"Oak","Width":"1600mm"}`. |
| `title` | Listing name plus variation label, cut to 150 characters at a word. |
| `description` | The product description (falling back to the short description, then the meta description), HTML stripped, cut to 5,000 characters. |
| `url` | The listing with the variation selected - the same address the sitemap and canonical tag use. |
| `brand` | The supplier the product is filed under (if **Use each product's supplier as its brand** is on), else **Brand when nothing else says**. |
| `seller_name`, `seller_url` | **Seller name** (or the site name), and the site address. |
| `image_url`, `additional_image_urls` | The variation's own photos, primary first; the listing's if it has none. |
| `availability` | `in_stock`, `out_of_stock`, `pre_order` or `backorder`, from the shop's stock rules. |
| `price`, `sale_price` | What a shopper pays, VAT included whatever the storefront shows, e.g. `199.00 GBP`. A sale price only while it is switched on and lower. |
| `gtin` | The product's barcode, only if it is a valid 8/12/13/14-digit code. |
| `mpn` | The product code, only with **Send product codes as manufacturer part numbers** ticked. |
| `condition` | **Condition** setting. |
| `product_category` | The product's category path, e.g. `Furniture > Desks`. |
| `weight`, `item_weight_unit` | The product weight, when it has a unit OpenAI accepts. |
| `accepts_returns`, `return_deadline_in_days`, `return_policy` | The **Returns** card. A product marked not returnable always says `false`. |
| `is_ads_eligible` | `true` on every product with **Offer products for ChatGPT adverts** ticked; left out otherwise. |

## What gets left out

The feed holds back a product rather than send one OpenAI would reject, and **Check the feed** lists each one:

- **No photo** - `image_url` is required.
- **No brand** - brand is required. Fix by filling in the supplier on the product, or setting **Brand when nothing else says**.
- **No price** - a price of zero.

It also follows the shop's own rules: only active, visible, physical products; spare parts never; and sold-out products stay out if the shop hides them from shoppers. **Include products that are out of stock** decides whether the rest go in marked `out_of_stock`.

## Database

One table, `cpf_settings` (single row): the switch, the key, the settings above, and when the feed was last collected. The feed itself is never stored. Removed when the module is uninstalled.

---

**Wiki:** [Home](Home) · [Modules](Modules) · [Shop](Shop) · [Shop Variations](Shop-variations) · [Google Shopping](Google-Shopping) · [Configuration reference](Configuration-reference)
