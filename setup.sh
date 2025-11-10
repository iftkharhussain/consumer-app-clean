#!/bin/bash

# Consumer App API - Setup Script
# This script helps you set up the project quickly

echo "🚀 Consumer App API - Phase 1 Setup"
echo "===================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v16 or higher."
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi

echo "✅ npm version: $(npm -v)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"
echo ""

# Setup .env file
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: Please update the .env file with your credentials:"
    echo "   - MongoDB connection string (MONGODB_URI)"
    echo "   - Fortus API credentials (FORTUS_USERNAME, FORTUS_PASSWORD)"
    echo ""
else
    echo "ℹ️  .env file already exists, skipping creation"
    echo ""
fi

# Check if MongoDB is running (optional)
echo "🔍 Checking MongoDB connection..."
if command -v mongosh &> /dev/null; then
    mongosh --eval "db.version()" --quiet > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "✅ MongoDB is running"
    else
        echo "⚠️  Cannot connect to MongoDB. Please ensure MongoDB is running."
    fi
elif command -v mongo &> /dev/null; then
    mongo --eval "db.version()" --quiet > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "✅ MongoDB is running"
    else
        echo "⚠️  Cannot connect to MongoDB. Please ensure MongoDB is running."
    fi
else
    echo "ℹ️  MongoDB CLI not found. Please ensure MongoDB is installed and running."
fi
echo ""

# Setup complete
echo "✅ Setup complete!"
echo ""
echo "📚 Next steps:"
echo "   1. Update .env file with your credentials"
echo "   2. Ensure MongoDB is running"
echo "   3. Run 'npm run dev' to start the development server"
echo "   4. Test the API: curl http://localhost:3025/api/health"
echo ""
echo "📖 Documentation:"
echo "   - README.md - Project overview"
echo "   - API_DOCUMENTATION.md - API endpoints"
echo "   - TESTING_GUIDE.md - Testing instructions"
echo ""
echo "🎉 Happy coding!"
