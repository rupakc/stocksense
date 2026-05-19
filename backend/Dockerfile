FROM python:3.14-slim

WORKDIR /app

# System deps: gcc/g++/make for CmdStan compilation; curl for download; procps for diagnostics
RUN apt-get update && apt-get install -y \
    gcc g++ make curl procps \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

# Install CmdStan binary required by Prophet — compiles C++, takes ~5 min on first build
RUN python -c "import cmdstanpy; cmdstanpy.install_cmdstan(overwrite=True)" && \
    ls /root/.cmdstan/

COPY . .

RUN mkdir -p models/saved

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
