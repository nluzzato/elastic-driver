#!/bin/bash

# Alert Context Agent - Example Runner
# This script makes it easy to test different alert examples

echo "🚀 Alert Context Agent - Example Runner"
echo "========================================"

if [ $# -eq 0 ]; then
    echo "Available examples:"
    echo "  real_alert    - Real alert that exists in GitHub"
    echo "  simple_test   - Simple test alert (won't be found)"
    echo "  memory_alert  - Memory alert example"
    echo ""
    echo "Usage: ./run-example.sh <example_name>"
    echo "Example: ./run-example.sh real_alert"
    exit 1
fi

EXAMPLE_NAME=$1
EXAMPLES_FILE="examples/alert-examples.json"

if [ ! -f "$EXAMPLES_FILE" ]; then
    echo "❌ Examples file not found: $EXAMPLES_FILE"
    exit 1
fi

# Extract the specific example using jq (if available) or node
if command -v jq >/dev/null 2>&1; then
    ALERT_JSON=$(jq -c ".$EXAMPLE_NAME" "$EXAMPLES_FILE")
    if [ "$ALERT_JSON" = "null" ]; then
        echo "❌ Example '$EXAMPLE_NAME' not found in $EXAMPLES_FILE"
        exit 1
    fi
else
    # Fallback to node if jq is not available
    ALERT_JSON=$(node -e "
        const fs = require('fs');
        const examples = JSON.parse(fs.readFileSync('$EXAMPLES_FILE', 'utf8'));
        if (examples['$EXAMPLE_NAME']) {
            console.log(JSON.stringify(examples['$EXAMPLE_NAME']));
        } else {
            console.error('Example not found');
            process.exit(1);
        }
    ")
    if [ $? -ne 0 ]; then
        echo "❌ Example '$EXAMPLE_NAME' not found in $EXAMPLES_FILE"
        exit 1
    fi
fi

echo "📥 Running example: $EXAMPLE_NAME"
echo ""

# Run the alert processor
npm run alert "$ALERT_JSON"
