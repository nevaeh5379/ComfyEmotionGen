// Default empty config. Overwritten at runtime by:
//   - Docker:  /docker-entrypoint.d/40-write-config.sh from $BACKEND_URL
//   - Portable: launcher.py serves this dynamically with the allocated port
// In `npm run dev` this stub keeps /config.js from 404'ing.
