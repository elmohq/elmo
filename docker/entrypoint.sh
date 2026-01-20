#!/bin/sh

# Load Tinybird token from init container if file exists
CONFIG_FILE="/app/tinybird-config/tinybird.env"
if [ -f "$CONFIG_FILE" ]; then
    echo "Loading Tinybird configuration from $CONFIG_FILE..."
    # Source the env file (each line is VAR=value format)
    while IFS='=' read -r key value; do
        # Skip empty lines and comments
        [ -z "$key" ] && continue
        [ "${key#\#}" != "$key" ] && continue
        # Export the variable
        export "$key=$value"
        echo "  Set $key"
    done < "$CONFIG_FILE"
else
    echo "Warning: Tinybird config not found at $CONFIG_FILE"
    echo "  Tinybird features may not work. Check if tinybird-init completed."
fi

# Run database migrations (worker image has deps installed)
echo "Running database migrations..."
pnpm --filter @workspace/web drizzle-kit migrate

# Execute the main command
exec "$@"
