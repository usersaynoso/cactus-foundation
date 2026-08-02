-- Integrity checks for a product import. Every count must be zero except the ones under
-- "pre-existing", which should match what they were before the import - run this file on
-- its own first so you know your baseline.
--
-- Used two ways: run_import.py `check` splices it into the transaction before a ROLLBACK,
-- and `apply` runs it afterwards.

\echo '=== catalogue totals ==='
SELECT count(*) AS products,
       count(*) FILTER (WHERE catalogue_hidden = false) AS listings,
       count(*) FILTER (WHERE catalogue_hidden) AS variations,
       count(*) FILTER (WHERE status <> 'ACTIVE') AS not_active
FROM shp_products;

\echo '=== must all be zero ==='

-- A listing with no category is unreachable from the shop's navigation.
SELECT count(*) AS listings_without_master_category
FROM shp_products WHERE catalogue_hidden = false AND master_category_id IS NULL;

SELECT count(*) AS listings_without_any_category
FROM shp_products p WHERE p.catalogue_hidden = false
  AND NOT EXISTS (SELECT 1 FROM shp_product_categories pc WHERE pc.product_id = p.id);

-- A parent with variations but no options gives the shopper nothing to choose, so
-- nothing can be added to the basket. One variation and no options should have been
-- written as a plain product instead.
SELECT count(*) AS parents_with_variations_but_no_options
FROM shp_products p WHERE p.catalogue_hidden = false
  AND EXISTS (SELECT 1 FROM svr_variants v WHERE v.product_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM svr_options o WHERE o.product_id = p.id);

-- Every variation must carry exactly one value per option of its parent, or the
-- storefront cannot match a shopper's selection to it.
SELECT count(*) AS variations_with_wrong_number_of_values FROM (
  SELECT v.id,
         (SELECT count(*) FROM svr_variant_values vv WHERE vv.variant_id = v.id) AS got,
         (SELECT count(*) FROM svr_options o WHERE o.product_id = v.product_id) AS want
  FROM svr_variants v) t
WHERE got <> want;

-- Two variations sharing a combination means one of them is unbuyable.
SELECT count(*) AS duplicate_option_combinations FROM (
  SELECT product_id, k FROM (
    SELECT v.product_id,
           string_agg(vv.option_value_id::text, ',' ORDER BY vv.option_value_id) AS k
    FROM svr_variants v JOIN svr_variant_values vv ON vv.variant_id = v.id
    GROUP BY v.id, v.product_id) x
  GROUP BY product_id, k HAVING count(*) > 1) y;

-- Two options with the same name on one listing render as duplicate rows.
SELECT count(*) AS duplicate_option_names_on_one_listing FROM (
  SELECT product_id, name FROM svr_options GROUP BY 1, 2 HAVING count(*) > 1) t;

SELECT count(*) AS blank_option_value_labels
FROM svr_option_values WHERE btrim(label) = '';

-- The owner's cap.
SELECT count(*) AS listings_over_four_options FROM (
  SELECT product_id FROM svr_options GROUP BY 1 HAVING count(*) > 4) t;

-- A width and a depth are separate options here; "120 x 60cm" as one value is the
-- shortcut that has to be undone.
SELECT count(*) AS width_by_depth_option_values
FROM svr_option_values WHERE label ~ '[0-9] x [0-9]';

SELECT count(*) AS product_names_with_width_by_depth
FROM shp_products WHERE name ~ '[0-9] x [0-9]cm';

-- Millimetre labels start a second set of values meaning the same thing as the cm ones
-- the rest of the catalogue uses, which breaks attribute filtering.
SELECT count(*) AS millimetre_option_values
FROM svr_option_values ov JOIN svr_options o ON o.id = ov.option_id
WHERE o.name IN ('Width', 'Depth', 'Height', 'Size') AND ov.label ~ 'mm$';

-- Options are meant to be sourced from the shared attribute library; an unsourced one
-- has no swatch images and does not join the shop's filters.
SELECT count(*) AS options_not_sourced_from_attributes
FROM svr_options WHERE source_ref IS NULL;

-- Catalog and Range belong on every listing as a per-variation column, hidden from the
-- public filters, so the owner can fill them in from the Variations tab or the sheet.
SELECT count(*) AS listings_missing_a_variation_column_attribute
FROM shp_products p
CROSS JOIN pat_attributes a
WHERE p.catalogue_hidden = false
  AND a.slug IN ('catalog', 'range')
  AND NOT EXISTS (SELECT 1 FROM pat_product_attributes pa
                   WHERE pa.product_id = p.id AND pa.attribute_id = a.id
                     AND pa.use_for_variations AND NOT pa.show_in_filters);

\echo '=== pre-existing: compare against the baseline, do not expect zero ==='

-- Anything buyable needs a price. Sits here rather than above because this site carries
-- a handful of zero-priced test rows from before these imports; what matters is that the
-- number does not go up.
SELECT count(*) AS buyable_products_without_a_price
FROM shp_products WHERE (catalogue_hidden OR sku IS NOT NULL) AND price <= 0;

-- A hidden product no variation points at still holds its SKU and is invisible.
SELECT count(*) AS orphan_hidden_products
FROM shp_products p WHERE p.catalogue_hidden
  AND NOT EXISTS (SELECT 1 FROM svr_variants v WHERE v.child_product_id = p.id);

-- Options that do not summarise themselves on the category grid.
SELECT count(*) AS options_not_shown_on_product_cards
FROM svr_options WHERE NOT card_display;
