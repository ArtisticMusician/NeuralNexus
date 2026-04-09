#!/bin/bash

# setup-qdrant.sh: Automates Qdrant setup for Native Mode

QDRANT_VERSION="v1.17.0"
BIN_DIR="./bin"
DATA_DIR="./qdrant_data"
OS_TYPE=$(uname -s)
ARCH_TYPE=$(uname -m)

echo "--- Setting up Qdrant for Native Mode ---"
...
if [ ! -f "$BIN_DIR/qdrant" ]; then
    echo "Downloading Qdrant $QDRANT_VERSION..."
    curl -L "$URL" -o "$BIN_DIR/qdrant.tar.gz"
    
    echo "Extracting..."
    tar -xzf "$BIN_DIR/qdrant.tar.gz" -C "$BIN_DIR"
    rm "$BIN_DIR/qdrant.tar.gz"
    chmod +x "$BIN_DIR/qdrant"
    echo "SUCCESS: Qdrant binary installed in $BIN_DIR"
else
    echo "SKIP: Qdrant binary already exists in $BIN_DIR"
fi

# Create a minimal config to suppress warnings
echo "Creating default Qdrant configuration..."
echo "storage:" > config/config.yaml
echo "  storage_path: $DATA_DIR" >> config/config.yaml
echo "telemetry_disabled: true" >> config/config.yaml
cp config/config.yaml config/development.yaml
...
echo "Setup complete!"
echo "Usage: ./scripts/run-qdrant.sh"
