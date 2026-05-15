#!/bin/bash
# setup.sh — AI Permission Abuse Detector Backend Setup

set -e

echo "================================================"
echo " AI Permission Abuse Detector — Backend Setup"
echo "================================================"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.9+ first."
    exit 1
fi

PYTHON_VER=$(python3 --version 2>&1 | awk '{print $2}')
echo "✓ Python $PYTHON_VER found"

# Create virtual environment
echo ""
echo "Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -q --upgrade pip
pip install -q fastapi uvicorn[standard] scikit-learn numpy pydantic python-multipart

echo "✓ Dependencies installed"

# Create data directory
mkdir -p data
echo "✓ Data directory created"

# Train initial model
echo ""
echo "Training initial ML classifier..."
python3 -c "
from models.classifier import SiteClassifier
from models.database import Database
db = Database()
db.init()
clf = SiteClassifier()
clf.train()
print('✓ Initial model trained and saved')
"

echo ""
echo "================================================"
echo " Setup Complete!"
echo "================================================"
echo ""
echo "To start the backend server:"
echo "  source venv/bin/activate"
echo "  python main.py"
echo ""
echo "API will be available at: http://localhost:8000"
echo "API docs at: http://localhost:8000/docs"
echo ""
