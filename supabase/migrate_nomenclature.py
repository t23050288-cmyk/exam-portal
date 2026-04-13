from db.supabase_client import get_supabase
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migration")

def migrate():
    db = get_supabase()
    
    # We can't run ALTER TABLE directly via the Supabase Python client's table() interface.
    # We usually use the SQL Editor in the Supabase Dashboard.
    # However, if we have the service key, we could potentially use an RPC or raw SQL if the client supports it.
    # For this environment, I will advise the user to run the SQL in the dashboard,
    # OR I can try to perform a dummy insert to see if it works after the user updates it.
    
    logger.info("Database Migration Script")
    logger.info("-------------------------")
    logger.info("Please run the following SQL in your Supabase SQL Editor:")
    logger.info("")
    logger.info("ALTER TABLE questions ADD COLUMN IF NOT EXISTS exam_name TEXT DEFAULT 'Initial Assessment';")
    logger.info("")
    logger.info("Once run, the Nomenclature Anchor system will be fully operational.")

if __name__ == "__main__":
    migrate()
