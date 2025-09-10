from fastapi import FastAPI, HTTPException
import os
import json
import boto3
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

app = FastAPI(title="Agentic FastAPI Service", version="1.0.0")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get environment variables
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
DATABASE_URL_SECRET = os.getenv("DATABASE_URL", "")

def get_database_connection():
    """Get database connection using AWS Secrets Manager"""
    try:
        # Check if DATABASE_URL_SECRET is available
        if not DATABASE_URL_SECRET:
            logger.error("DATABASE_URL environment variable is empty or not set")
            return None
            
        logger.info(f"DATABASE_URL_SECRET length: {len(DATABASE_URL_SECRET)}")
        
        # DATABASE_URL is injected as a secret, so it contains the JSON directly
        secret = json.loads(DATABASE_URL_SECRET)
        logger.info(f"Parsed secret keys: {list(secret.keys())}")
        
        # Connect to database
        conn = psycopg2.connect(
            host=secret['host'],
            database=secret['dbname'],
            user=secret['username'],
            password=secret['password'],
            port=secret.get('port', 5432)
        )
        logger.info("Database connection successful")
        return conn
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse DATABASE_URL as JSON: {e}")
        return None
    except KeyError as e:
        logger.error(f"Missing key in database secret: {e}")
        return None
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return None

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Agentic FastAPI Service",
        "environment": ENVIRONMENT,
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint for load balancer"""
    return {
        "status": "healthy",
        "environment": ENVIRONMENT,
        "service": "fastapi"
    }

@app.get("/api/status")
async def api_status():
    """API status endpoint"""
    return {
        "status": "operational",
        "environment": ENVIRONMENT,
        "service": "fastapi-backend",
        "database_connected": await check_database_connection()
    }

@app.get("/api/db-test")
async def database_test():
    """Test database connectivity and return sample data"""
    try:
        conn = get_database_connection()
        if not conn:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # Create test table if it doesn't exist
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS test_data (
                    id SERIAL PRIMARY KEY,
                    message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Insert test data
            cursor.execute("""
                INSERT INTO test_data (message) 
                VALUES ('Hello from Stage3v3 FastAPI!') 
                ON CONFLICT DO NOTHING
            """)
            
            # Fetch test data
            cursor.execute("SELECT * FROM test_data ORDER BY created_at DESC LIMIT 5")
            results = cursor.fetchall()
            
        conn.commit()
        conn.close()
        
        return {
            "status": "success",
            "environment": ENVIRONMENT,
            "database_connected": True,
            "test_data": [dict(row) for row in results]
        }
        
    except Exception as e:
        logger.error(f"Database test failed: {e}")
        raise HTTPException(status_code=500, detail=f"Database test failed: {str(e)}")

async def check_database_connection():
    """Check if database connection is working"""
    try:
        conn = get_database_connection()
        if conn:
            conn.close()
            return True
        return False
    except:
        return False

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)