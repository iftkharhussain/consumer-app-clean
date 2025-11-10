#!/bin/bash

# Environment Configuration Script
# Usage: ./env-setup.sh [local|dev|production]

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Check if environment argument is provided
if [ -z "$1" ]; then
    echo "Usage: ./env-setup.sh [local|dev|production]"
    echo ""
    echo "Available environments:"
    echo "  local       - Local development with MongoDB on localhost"
    echo "  dev         - Development environment with remote MongoDB"
    echo "  production  - Production environment"
    echo ""
    exit 1
fi

ENV=$1

# Validate environment
if [ "$ENV" != "local" ] && [ "$ENV" != "dev" ] && [ "$ENV" != "production" ]; then
    print_error "Invalid environment: $ENV"
    echo "Valid options are: local, dev, production"
    exit 1
fi

# Check if environment file exists
ENV_FILE=".env.$ENV"
if [ ! -f "$ENV_FILE" ]; then
    print_error "Environment file not found: $ENV_FILE"
    exit 1
fi

print_success "Environment validated: $ENV"
print_success "Environment file: $ENV_FILE"

# Display current configuration
echo ""
echo "Configuration in $ENV_FILE:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Read and display key variables
if [ -f "$ENV_FILE" ]; then
    NODE_ENV=$(grep "^NODE_ENV=" "$ENV_FILE" | cut -d '=' -f2)
    PORT=$(grep "^PORT=" "$ENV_FILE" | cut -d '=' -f2)
    LOG_LEVEL=$(grep "^LOG_LEVEL=" "$ENV_FILE" | cut -d '=' -f2)
    
    echo "NODE_ENV:   $NODE_ENV"
    echo "PORT:       $PORT"
    echo "LOG_LEVEL:  $LOG_LEVEL"
    
    # Check if MongoDB URI is set
    MONGODB_URI=$(grep "^MONGODB_URI=" "$ENV_FILE" | cut -d '=' -f2)
    if [[ $MONGODB_URI == *"your"* ]] || [[ $MONGODB_URI == *"password"* ]]; then
        print_error "MongoDB URI needs to be configured in $ENV_FILE"
    else
        print_success "MongoDB URI is configured"
    fi
    
    # Check if Fortus credentials are set
    FORTUS_USERNAME=$(grep "^FORTUS_USERNAME=" "$ENV_FILE" | cut -d '=' -f2)
    if [[ $FORTUS_USERNAME == *"your"* ]]; then
        print_error "Fortus credentials need to be configured in $ENV_FILE"
    else
        print_success "Fortus credentials are configured"
    fi
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
print_info "To use this environment, run:"
echo ""
if [ "$ENV" == "local" ]; then
    echo "  npm run dev             # or npm run dev:local"
elif [ "$ENV" == "dev" ]; then
    echo "  npm run dev:dev         # or npm run start:dev"
elif [ "$ENV" == "production" ]; then
    echo "  npm run start:production"
fi
echo ""
print_info "Update credentials in $ENV_FILE if needed"
