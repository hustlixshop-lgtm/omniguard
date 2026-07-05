-- Claim next scan function for workers
CREATE OR REPLACE FUNCTION claim_next_scan(worker_id text)
RETURNS TABLE(scan_id uuid, repository_id uuid, organization_id uuid)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE scan_queue
  SET
    status = 'processing',
    claimed_at = now(),
    worker_id = claim_next_scan.worker_id
  WHERE id = (
    SELECT id FROM scan_queue
    WHERE status = 'pending'
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING scan_queue.scan_id, scan_queue.repository_id, scan_queue.organization_id;
END;
$$;

-- Create scan queue trigger
CREATE OR REPLACE FUNCTION queue_scan_on_create()
RETURNS TRIGGER
AS $$
BEGIN
  INSERT INTO scan_queue (scan_id, organization_id, repository_id, priority, status)
  VALUES (
    NEW.id,
    NEW.organization_id,
    NEW.repository_id,
    NEW.priority,
    'pending'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
DROP TRIGGER IF EXISTS on_scan_created ON scans;
CREATE TRIGGER on_scan_created
  AFTER INSERT ON scans
  FOR EACH ROW
  EXECUTE FUNCTION queue_scan_on_create();

-- Realtime subscription for scans
ALTER PUBLICATION supabase_realtime ADD TABLE scans;
ALTER PUBLICATION supabase_realtime ADD TABLE findings;
