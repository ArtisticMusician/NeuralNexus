#!/bin/bash
echo "🚀 Starting Qdrant..."
QDRANT__STORAGE__STORAGE_PATH="./qdrant_data" QDRANT__SERVICE__HTTP_PORT="5304" ./bin/qdrant

