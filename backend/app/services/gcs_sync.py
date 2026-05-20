"""GCS persistence for the SQLite database and trained ML model files.

GCS layout inside the configured bucket:

    db/stocksense.db             ← SQLite database snapshot
    models/<symbol>_prophet.joblib ← trained Prophet / GBM model files

When GCS_BUCKET is empty (local dev / CI), every method is a no-op that
returns a safe default — no special-casing required in calling code.

Thread safety: all public methods are blocking and designed to be called via
asyncio.to_thread() from async code.  The class itself holds no mutable state
after __init__ so it is safe to share across threads.
"""

from __future__ import annotations

import logging
import os
import sqlite3
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

_DB_BLOB = "db/stocksense.db"
_MODELS_PREFIX = "models/"


class GCSSync:
    """Upload/download the SQLite DB and ML models to/from a GCS bucket.

    Instantiate once at startup via init_gcs_sync(); retrieve the singleton
    with get_gcs_sync().  A no-op instance (empty bucket name) is returned
    when GCS is not configured so callers never need to guard against None.
    """

    def __init__(self, bucket_name: str) -> None:
        self._bucket_name = bucket_name
        self._client = None

        if not bucket_name:
            return

        try:
            from google.cloud import storage

            self._client = storage.Client()
            logger.info(f"[gcs] Persistence enabled — bucket: {bucket_name}")
        except ImportError:
            logger.warning("[gcs] google-cloud-storage not installed; persistence disabled")
        except Exception as exc:
            logger.warning(f"[gcs] Could not initialise storage client: {exc}")

    @property
    def enabled(self) -> bool:
        return self._client is not None

    def _bucket(self):
        return self._client.bucket(self._bucket_name)

    # ── Database ──────────────────────────────────────────────────────────────

    def download_db(self, local_path: str) -> bool:
        """Download the DB snapshot from GCS to local_path.

        Returns True if downloaded, False if not available (first run) or disabled.
        """
        if not self.enabled:
            return False
        try:
            blob = self._bucket().blob(_DB_BLOB)
            if not blob.exists():
                logger.info("[gcs] No DB snapshot found — starting with a fresh database")
                return False
            Path(local_path).parent.mkdir(parents=True, exist_ok=True)
            blob.download_to_filename(local_path)
            size_mb = Path(local_path).stat().st_size / 1_048_576
            logger.info(f"[gcs] Restored DB ({size_mb:.1f} MB) → {local_path}")
            return True
        except Exception as exc:
            logger.warning(f"[gcs] DB download failed: {exc}")
            return False

    def backup_db(self, local_path: str) -> bool:
        """Create a consistent SQLite snapshot and upload it to GCS.

        Uses the sqlite3 online backup API so the upload is safe even while
        the database is being written to by the running application.
        Returns True on success.
        """
        if not self.enabled:
            return False
        if not Path(local_path).exists():
            return False
        tmp_path: str | None = None
        try:
            # sqlite3 backup API: copies a live DB into a temp file consistently
            with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
                tmp_path = tmp.name

            src = sqlite3.connect(local_path, timeout=30)
            dst = sqlite3.connect(tmp_path)
            try:
                with dst:
                    src.backup(dst)
            finally:
                src.close()
                dst.close()

            blob = self._bucket().blob(_DB_BLOB)
            blob.upload_from_filename(tmp_path)
            size_mb = Path(local_path).stat().st_size / 1_048_576
            logger.info(
                f"[gcs] Backed up DB ({size_mb:.1f} MB) → gs://{self._bucket_name}/{_DB_BLOB}"
            )
            return True
        except Exception as exc:
            logger.warning(f"[gcs] DB backup failed: {exc}")
            return False
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    # ── ML Models ─────────────────────────────────────────────────────────────

    def download_models(self, local_dir: str) -> int:
        """Download all model files from GCS into local_dir.

        Returns the number of files downloaded (0 if none exist or disabled).
        """
        if not self.enabled:
            return 0
        try:
            Path(local_dir).mkdir(parents=True, exist_ok=True)
            blobs = list(self._client.list_blobs(self._bucket_name, prefix=_MODELS_PREFIX))
            count = 0
            for blob in blobs:
                name = Path(blob.name).name
                if not name:
                    continue
                blob.download_to_filename(str(Path(local_dir) / name))
                count += 1
            if count:
                logger.info(f"[gcs] Restored {count} model file(s) → {local_dir}")
            return count
        except Exception as exc:
            logger.warning(f"[gcs] Model download failed: {exc}")
            return 0

    def upload_model(self, local_path: str) -> bool:
        """Upload a single model file to GCS.

        Call this immediately after joblib.dump() so the model is durable
        even if the container is restarted before the next periodic backup.
        Returns True on success.
        """
        if not self.enabled:
            return False
        path = Path(local_path)
        if not path.exists():
            return False
        try:
            blob_name = f"{_MODELS_PREFIX}{path.name}"
            self._bucket().blob(blob_name).upload_from_filename(str(path))
            logger.info(f"[gcs] Uploaded model → gs://{self._bucket_name}/{blob_name}")
            return True
        except Exception as exc:
            logger.warning(f"[gcs] Model upload failed for {path.name}: {exc}")
            return False


# ── Module-level singleton ────────────────────────────────────────────────────

_instance: GCSSync = GCSSync("")  # no-op default; replaced by init_gcs_sync()


def init_gcs_sync(bucket_name: str) -> GCSSync:
    """Initialise the module singleton.  Call once at application startup."""
    global _instance
    _instance = GCSSync(bucket_name)
    return _instance


def get_gcs_sync() -> GCSSync:
    """Return the active GCSSync singleton (no-op if not initialised)."""
    return _instance
