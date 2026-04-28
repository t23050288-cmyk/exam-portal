FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements from the python_api folder
COPY python_api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire backend source
COPY python_api/ .

# Expose the port Railway provides (PORT env var)
EXPOSE 8080

# Command to run the FastAPI app
# We use uvicorn and bind to 0.0.0.0 and the $PORT provided by Railway
CMD ["sh", "-c", "uvicorn index:app --host 0.0.0.0 --port ${PORT:-8080}"]
