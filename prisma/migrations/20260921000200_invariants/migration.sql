-- PostgreSQL-only invariants are committed migrations: Prisma schema alone cannot express them.
-- Never replace migrations with db push: doing so would omit these protections.

ALTER TABLE "User" ADD CONSTRAINT "User_normalized_email"
  CHECK (email = lower(btrim(email)) AND length(email) > 3 AND position('@' in email) > 1);
ALTER TABLE "NewsletterLead" ADD CONSTRAINT "NewsletterLead_normalized_email"
  CHECK (email = lower(btrim(email)) AND length(email) > 3 AND position('@' in email) > 1);

-- Exactly one default per nonempty address book: uniqueness is immediate; existence is checked at commit.
CREATE UNIQUE INDEX "Address_one_default_per_user" ON "Address" ("userId") WHERE "isDefault";
CREATE FUNCTION lock_address_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'An address cannot change owners' USING ERRCODE = '23514';
  END IF;
  -- Serialize changes to a user's address book so concurrent writers cannot remove its last default.
  PERFORM 1 FROM "User" WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD."userId" ELSE NEW."userId" END FOR UPDATE;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Address_lock_owner" BEFORE INSERT OR UPDATE OR DELETE ON "Address"
  FOR EACH ROW EXECUTE FUNCTION lock_address_owner();

CREATE FUNCTION require_default_address() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id text;
BEGIN
  owner_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."userId" ELSE NEW."userId" END;
  IF EXISTS (SELECT 1 FROM "Address" WHERE "userId" = owner_id)
     AND NOT EXISTS (SELECT 1 FROM "Address" WHERE "userId" = owner_id AND "isDefault") THEN
    RAISE EXCEPTION 'A nonempty address book must have one default address' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "Address_require_default" AFTER INSERT OR UPDATE OR DELETE ON "Address"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_default_address();

ALTER TABLE "Address" ADD CONSTRAINT "Address_country_code" CHECK ("countryCode" ~ '^[A-Z]{2}$');
ALTER TABLE "Product" ADD CONSTRAINT "Product_nonnegative_price" CHECK ("basePrice" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_slug_format" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "ProductVariant" ADD CONSTRAINT "Variant_nonnegative_stock" CHECK ("stockQuantity" >= 0);
ALTER TABLE "ProductVariant" ADD CONSTRAINT "Variant_nonnegative_price" CHECK ("priceOverride" IS NULL OR "priceOverride" >= 0);
ALTER TABLE "ProductImage" ADD CONSTRAINT "Image_dimensions_and_position" CHECK (
  position >= 0 AND (width IS NULL OR width > 0) AND (height IS NULL OR height > 0));
ALTER TABLE "OrderItem" ADD CONSTRAINT "Item_positive_quantity_and_price" CHECK (quantity > 0 AND "unitPrice" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_amounts" CHECK (
  subtotal >= 0 AND "shippingAmount" >= 0 AND "taxAmount" >= 0 AND "discountAmount" >= 0
  AND "totalAmount" >= 0 AND "discountAmount" <= subtotal
  AND "totalAmount" = subtotal + "shippingAmount" + "taxAmount" - "discountAmount");
ALTER TABLE "Order" ADD CONSTRAINT "Order_country_code" CHECK ("shippingCountryCode" ~ '^[A-Z]{2}$');
ALTER TABLE "Order" ADD CONSTRAINT "Order_reference_nonempty" CHECK ("paymentReference" IS NULL OR length(btrim("paymentReference")) > 0);
ALTER TABLE "ContentBlock" ADD CONSTRAINT "Content_document_object" CHECK (jsonb_typeof(content) = 'object' AND "schemaVersion" > 0 AND revision > 0);
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "Analytics_metadata_object" CHECK (jsonb_typeof(metadata) = 'object');

-- Snapshots are append-only purchase records. Status/payment updates belong on Order.
CREATE FUNCTION protect_order_item_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Order item snapshots are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "OrderItem_immutable_snapshot" BEFORE UPDATE ON "OrderItem"
  FOR EACH ROW EXECUTE FUNCTION protect_order_item_snapshot();

CREATE FUNCTION protect_shipping_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."shippingRecipient", NEW."shippingPhone", NEW."shippingLine1", NEW."shippingLine2", NEW."shippingCity", NEW."shippingProvince", NEW."shippingPostalCode", NEW."shippingCountryCode")
     IS DISTINCT FROM ROW(OLD."shippingRecipient", OLD."shippingPhone", OLD."shippingLine1", OLD."shippingLine2", OLD."shippingCity", OLD."shippingProvince", OLD."shippingPostalCode", OLD."shippingCountryCode") THEN
    RAISE EXCEPTION 'Order shipping snapshots are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Order_immutable_shipping" BEFORE UPDATE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION protect_shipping_snapshot();

-- Deferred checks allow a nested order/items insert, but reject an empty or mispriced order at commit.
CREATE FUNCTION check_order_subtotal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_id text; expected numeric; actual numeric; item_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'Order' THEN
    order_id := NEW.id;
  ELSE
    order_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."orderId" ELSE NEW."orderId" END;
  END IF;
  SELECT subtotal INTO expected FROM "Order" WHERE id = order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(sum(quantity * "unitPrice"), 0), count(*) INTO actual, item_count FROM "OrderItem" WHERE "orderId" = order_id;
  IF item_count = 0 OR actual <> expected THEN
    RAISE EXCEPTION 'Order must contain items whose prices sum to its subtotal' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "Order_check_subtotal" AFTER INSERT OR UPDATE ON "Order"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_order_subtotal();
CREATE CONSTRAINT TRIGGER "OrderItem_check_subtotal" AFTER INSERT OR UPDATE OR DELETE ON "OrderItem"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_order_subtotal();
