#!/bin/bash

# Consumer App API - First Time Setup & Installation Guide
# Run this script after cloning the repository

echo "╔════════════════════════════════════════════════════════╗"
echo "║   Consumer App API - Phase 1 Installation Guide       ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${GREEN}ℹ${NC} $1"
}

# Step 1: Check Node.js
echo "Step 1: Checking prerequisites..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    print_success "Node.js installed: $NODE_VERSION"
    
    # Check if version is 16 or higher
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$MAJOR_VERSION" -ge 16 ]; then
        print_success "Node.js version is compatible (v16+)"
    else
        print_warning "Node.js version should be v16 or higher"
    fi
else
    print_error "Node.js is not installed"
    echo "Please install Node.js v16 or higher from https://nodejs.org"
    exit 1
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    print_success "npm installed: v$NPM_VERSION"
else
    print_error "npm is not installed"
    exit 1
fi

echo ""

# Step 2: Install dependencies
echo "Step 2: Installing dependencies..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

npm install

if [ $? -eq 0 ]; then
    print_success "All dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

echo ""

# Step 3: Setup .env file
echo "Step 3: Setting up environment configuration..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -f .env ]; then
    cp .env.example .env
    print_success ".env file created from template"
    print_warning "You MUST update .env with your actual credentials"
    echo ""
    echo "Required configuration:"
    echo "  • MongoDB URI (MONGODB_URI)"
    echo "  • Fortus username (FORTUS_USERNAME)"
    echo "  • Fortus password - base64 encoded (FORTUS_PASSWORD)"
else
    print_info ".env file already exists"
fi

echo ""

# Step 4: Check MongoDB
echo "Step 4: Checking MongoDB..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v mongosh &> /dev/null || command -v mongo &> /dev/null; then
    print_success "MongoDB CLI found"
    
    # Try to connect
    if command -v mongosh &> /dev/null; then
        mongosh --eval "db.version()" --quiet > /dev/null 2>&1
    else
        mongo --eval "db.version()" --quiet > /dev/null 2>&1
    fi
    
    if [ $? -eq 0 ]; then
        print_success "MongoDB is running and accessible"
    else
        print_warning "Cannot connect to MongoDB"
        print_info "Make sure MongoDB is running before starting the server"
    fi
else
    print_warning "MongoDB CLI not found"
    print_info "Ensure MongoDB is installed and running"
fi

echo ""

# Step 5: Installation summary
echo "╔════════════════════════════════════════════════════════╗"
echo "║              Installation Complete! 🎉                  ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "Next Steps:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Configure your environment:"
echo "   nano .env"
echo ""
echo "2. Add required credentials to .env:"
echo "   ✓ MONGODB_URI - Your MongoDB connection string"
echo "   ✓ FORTUS_USERNAME - Your Fortus API username"
echo "   ✓ FORTUS_PASSWORD - Your Fortus API password (base64)"
echo ""
echo "3. Start the development server:"
echo "   npm run dev"
echo ""
echo "4. Test the API:"
echo "   curl http://localhost:3025/api/health"
echo ""
echo "5. Test Paperform webhook:"
echo "   curl -X POST http://localhost:3025/api/paperform/webhook \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d @examples/paperform-webhook-example.json"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📚 Documentation:"
echo "   • README.md - Project overview"
echo "   • QUICK_START.md - Quick reference guide"
echo "   • API_DOCUMENTATION.md - API reference"
echo "   • TESTING_GUIDE.md - Testing instructions"
echo ""
echo "🚀 Happy coding!"
echo ""
