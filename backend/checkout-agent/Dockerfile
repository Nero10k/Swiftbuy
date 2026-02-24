FROM python:3.12-slim

# Install uv for fast dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy dependency files first (layer caching)
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --frozen --no-dev

# Copy source code
COPY . .

# Create flows directory for persisting learned checkouts
RUN mkdir -p flows

EXPOSE 8100

CMD ["uv", "run", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8100"]

