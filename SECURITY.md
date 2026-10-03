# Security

This project is a prototype API intended for local use. It does not provide general API authentication or rate limiting. It binds to `127.0.0.1` by default; do not change the host to a network interface or deploy it publicly without adding appropriate authentication, rate limiting, and origin restrictions.

Keys entered in the browser's API keys panel are sent to the local server and held in its process memory until restart. They are not stored in browser storage, written to `.env`, returned by the settings API, or intentionally logged. Only use this feature on a trusted local device and connection. Alternatively, keep keys in a local `.env` file; never commit them or include them in public issues, pull requests, or logs. If a key is exposed, revoke it with its provider and replace it.

To report a suspected vulnerability, use GitHub private vulnerability reporting if it is enabled for this repository. Otherwise, contact the maintainers privately rather than publishing exploit details.
