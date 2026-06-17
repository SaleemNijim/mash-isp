-- ============================================================
-- MASH ISP — 003_triggers.sql
-- Blueprint v3.1 — Triggers & Automation
-- ============================================================

-- ============================================================
-- 1) log_soft_delete — قاعدة B3: OLD.tenant_id حصراً
--    AFTER UPDATE عندما يصبح is_deleted=true على الجداول المُدرَجة
-- ============================================================

CREATE OR REPLACE FUNCTION log_soft_delete() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_deleted = true AND OLD.is_deleted = false THEN
    INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_data, performed_by)
    VALUES (OLD.tenant_id, TG_TABLE_NAME, NEW.id, 'SOFT_DELETED', row_to_json(OLD), auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_soft_delete_customers
  AFTER UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete();

CREATE TRIGGER trg_soft_delete_subscriptions
  AFTER UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete();

CREATE TRIGGER trg_soft_delete_internet_credentials
  AFTER UPDATE ON internet_credentials
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete();

CREATE TRIGGER trg_soft_delete_card_products
  AFTER UPDATE ON card_products
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete();

CREATE TRIGGER trg_soft_delete_card_batches
  AFTER UPDATE ON card_batches
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete();

CREATE TRIGGER trg_soft_delete_network_routers
  AFTER UPDATE ON network_routers
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete();

CREATE TRIGGER trg_soft_delete_network_ports
  AFTER UPDATE ON network_ports
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete();

CREATE TRIGGER trg_soft_delete_warehouse_items
  AFTER UPDATE ON warehouse_items
  FOR EACH ROW EXECUTE FUNCTION log_soft_delete();

-- ============================================================
-- 2) update_stock_on_batch — AFTER INSERT على card_batch_items
-- ============================================================

CREATE OR REPLACE FUNCTION update_stock_on_batch() RETURNS TRIGGER AS $$
BEGIN
  UPDATE card_products
  SET quantity_in_stock = quantity_in_stock + NEW.quantity
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_stock_on_batch
  AFTER INSERT ON card_batch_items
  FOR EACH ROW EXECUTE FUNCTION update_stock_on_batch();

-- ============================================================
-- 3) reverse_stock_on_batch_delete — §5.4 حرفياً
-- ============================================================

CREATE OR REPLACE FUNCTION reverse_stock_on_batch_delete() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_deleted = true AND OLD.is_deleted = false THEN
    UPDATE card_products cp
    SET quantity_in_stock = GREATEST(0, quantity_in_stock - cbi.quantity)
    FROM card_batch_items cbi WHERE cbi.batch_id = NEW.id AND cp.id = cbi.product_id;

    INSERT INTO audit_logs (tenant_id, table_name, record_id, action, performed_by)
    VALUES (OLD.tenant_id, 'card_batches', NEW.id, 'BATCH_DELETED_STOCK_REVERSED', auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_reverse_batch_stock
  AFTER UPDATE ON card_batches FOR EACH ROW
  EXECUTE FUNCTION reverse_stock_on_batch_delete();

-- ============================================================
-- 4) log_mac_change — AFTER UPDATE على network_routers
--    عند تغيُّر mac_address فقط
-- ============================================================

CREATE OR REPLACE FUNCTION log_mac_change() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.mac_address IS DISTINCT FROM NEW.mac_address THEN
    INSERT INTO router_mac_history (router_id, old_mac, new_mac, changed_by, changed_at)
    VALUES (NEW.id, OLD.mac_address, NEW.mac_address, auth.uid(), now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_log_mac_change
  AFTER UPDATE ON network_routers
  FOR EACH ROW EXECUTE FUNCTION log_mac_change();

-- ============================================================
-- 5) cancel_debt_on_payment — AFTER INSERT على payments (BM5)
--    دين نشط للعميل نفسه → status='cancelled'
-- ============================================================

CREATE OR REPLACE FUNCTION cancel_debt_on_payment() RETURNS TRIGGER AS $$
BEGIN
  UPDATE debts
  SET status = 'cancelled'
  WHERE tenant_id  = NEW.tenant_id
    AND customer_id = NEW.customer_id
    AND status NOT IN ('cancelled', 'paid');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_cancel_debt_on_payment
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION cancel_debt_on_payment();
