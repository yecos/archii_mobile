import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';

const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2/token';

/**
 * POST — Refresh a Microsoft access token using a refresh token.
 *
 * Requires `AZURE_CLIENT_SECRET` to be set in environment variables.
 * Falls back to `NEXT_PUBLIC_MS_CLIENT_ID` for the client ID.
 *
 * Body: { refreshToken: string }
 * Returns: { accessToken: string, expiresIn: number }
 */
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require authentication before refreshing tokens
    await requireAuth(request);

    const body = await request.json();
    const { refreshToken } = body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      return NextResponse.json(
        { error: 'refreshToken is required' },
        { status: 400 }
      );
    }

    const clientId =
      process.env.AZURE_CLIENT_ID || process.env.NEXT_PUBLIC_MS_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    if (!clientSecret) {
      return NextResponse.json(
        {
          error: 'Azure AD not configured',
          message:
            'AZURE_CLIENT_SECRET environment variable is not set. Token refresh requires server-side client credentials.',
        },
        { status: 503 }
      );
    }

    if (!clientId) {
      return NextResponse.json(
        { error: 'Client ID not configured', message: 'AZURE_CLIENT_ID or NEXT_PUBLIC_MS_CLIENT_ID is required' },
        { status: 400 }
      );
    }

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'Files.ReadWrite.All Sites.ReadWrite.All offline_access',
    });

    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      let errorDetail: string;

      try {
        const errJson = JSON.parse(errBody);
        errorDetail =
          errJson.error_description || errJson.error || errBody;
      } catch {
        errorDetail = errBody;
      }

      // Handle specific token endpoint errors
      if (tokenRes.status === 400) {
        if (errorDetail.includes('AADSTS70008') || errorDetail.includes('AADSTS700082')) {
          // Refresh token expired
          return NextResponse.json(
            { error: 'Refresh token expired', code: 'REFRESH_TOKEN_EXPIRED', detail: errorDetail },
            { status: 401 }
          );
        }
        if (errorDetail.includes('AADSTS70000')) {
          // Invalid grant
          return NextResponse.json(
            { error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN', detail: errorDetail },
            { status: 401 }
          );
        }
      }

      return NextResponse.json(
        { error: 'Token refresh failed', detail: errorDetail },
        { status: tokenRes.status }
      );
    }

    const tokenData = await tokenRes.json();

    // Calculate expiry time from expires_in (seconds)
    const expiresIn = tokenData.expires_in || 3600; // Default 1 hour

    // SECURITY: Never return refresh tokens to the client.
    // Store new refresh token server-side if we had one before.
    // Personal tokens are managed client-side via MSAL, so we only
    // return the access token and metadata.
    if (tokenData.refresh_token) {
      console.warn('[OneDrive Token POST] New refresh token received but not returned to client (security).');
    }

    return NextResponse.json({
      accessToken: tokenData.access_token,
      expiresIn: Number(expiresIn),
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[OneDrive Token POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
