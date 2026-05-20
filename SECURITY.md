# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.0.x   | ✅        |
| < 2.0   | ❌        |

## Reporting a Vulnerability

If you discover a security vulnerability in Archii, please report it responsibly.

### Preferred Method

Open a **Security Advisory** on GitHub:
1. Go to [Security Advisories](https://github.com/yecos/archii/security/advisories/new)
2. Select "Report a vulnerability"
3. Describe the issue with enough detail to reproduce it
4. Include affected components, attack vectors, and potential impact

### Alternative

Email the maintainers directly at security@yecos.co (if available) with:
- Description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Suggested fix (optional)

### What to Expect

- We will acknowledge receipt within 48 hours
- We will provide an initial assessment within 7 business days
- We will keep you informed of progress toward a fix
- Credit will be given in the release notes (unless anonymity is requested)

## Security Architecture

Archii implements multiple layers of security:

### Authentication & Authorization
- **Firebase Auth** with email/password, Google OAuth, and Microsoft SSO
- **Multi-tenant isolation**: all Firestore queries enforce tenant-scoped access
- **Role-based access control**: Super Admin and Miembro roles
- **SSO/SAML** support via `/api/sso` endpoint
- **SCIM** provisioning via `/api/scim` endpoint

### Data Protection
- **AES-256-GCM encryption** for sensitive tokens stored in Firestore
- **Rate limiting** on all public endpoints (sliding window per user/tenant)
- **Tenant verification** on every API route via `verifyTenantMembership()`
- **Input validation** with parameterized Firestore queries (no string interpolation)
- **Content Security Policy** configured for Firebase, Google, and Microsoft auth flows

### API Security
- **API key authentication** for the public REST API (`/api/v1/`)
- **HMAC-SHA256 webhook signatures** to verify webhook authenticity
- **CORS** restrictions on API endpoints
- **No secrets in client-side code** — all sensitive operations are server-side

### Infrastructure
- **Firestore Security Rules** enforce tenant isolation at the database level
- **Vercel deployment** with automatic HTTPS
- **Dependency auditing** via `npm audit` in CI pipeline
- **Secret scanning** in CI to prevent credential leaks

## Security Best Practices for Contributors

When contributing to Archii, follow these security guidelines:

1. **Never commit secrets** — use `.env.local` for local development
2. **Always verify tenant membership** — use `verifyTenantMembership()` from `@/lib/tenant-utils`
3. **Encrypt sensitive data** — use `encryptToken()`/`decryptToken()` from `@/lib/token-encryption` for tokens
4. **Apply rate limiting** — use `checkRateLimit()` from `@/lib/rate-limiter` on public endpoints
5. **Use parameterized queries** — never concatenate user input into Firestore queries
6. **Validate inputs** — check types, ranges, and allowed values before processing
7. **Don't expose internal errors** — return generic error messages to clients

See [CONTRIBUTING.md](CONTRIBUTING.md) for full contribution guidelines.
