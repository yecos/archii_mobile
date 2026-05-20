import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/api-auth";

/**
 * GET /api/whatsapp/test
 * Endpoint de diagnostico para verificar la configuracion de WhatsApp.
 * Requiere autenticacion de administrador.
 *
 * Uso: GET /api/whatsapp/test?to=573001234567
 * (el parametro "to" es opcional — si lo incluyes, envia un mensaje de prueba)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Error de autenticación" }, { status: 401 });
  }

  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    checks: {},
  };

  // 1. Verificar variables de entorno (SIN exponer valores sensibles)
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  results.checks.envVars = {
    hasToken: !!token,
    hasPhoneId: !!phoneId,
    hasVerifyToken: !!verifyToken,
  };

  if (!token || !phoneId) {
    results.error = 'FALTAN variables de entorno. Revisa WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID en Vercel.';
    return NextResponse.json(results, { status: 500 });
  }

  // 2. Verificar token con Meta
  const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v25.0';

  {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const tokenCheck = await fetch(
        `https://graph.facebook.com/${API_VERSION}/me`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      const tokenData = await tokenCheck.json();

      if (tokenCheck.ok) {
        results.checks.tokenValid = true;
        results.checks.tokenInfo = {
          id: tokenData.id,
          name: tokenData.name || 'N/A',
          type: tokenData.type || 'N/A',
        };
      } else {
        results.checks.tokenValid = false;
        results.checks.tokenError = {
          status: tokenCheck.status,
          error: tokenData,
        };
        results.error = `Token INVALIDO (error ${tokenCheck.status}). Genera uno nuevo en Meta Developer Console.`;
        return NextResponse.json(results, { status: 401 });
      }
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        results.checks.tokenValid = 'timeout';
      } else {
        results.checks.tokenValid = 'error';
        results.checks.tokenNetworkError = err.message;
      }
    }
  }

  // 3. Verificar Phone Number
  {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const phoneCheck = await fetch(
        `https://graph.facebook.com/${API_VERSION}/${phoneId}?fields=name,display_phone_number,verified_name`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      const phoneData = await phoneCheck.json();

      if (phoneCheck.ok) {
        results.checks.phoneValid = true;
        results.checks.phoneInfo = {
          name: phoneData.name,
          displayPhone: phoneData.display_phone_number,
          verifiedName: phoneData.verified_name || 'N/A',
        };
      } else {
        results.checks.phoneValid = false;
        results.checks.phoneError = phoneData;
      }
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        results.checks.phoneValid = 'timeout';
      } else {
        results.checks.phoneValid = 'error';
        results.checks.phoneNetworkError = err.message;
      }
    }
  }

  // 4. Probar envio de mensaje (solo si se pasa ?to=)
  const url = new URL(request.url);
  const testPhone = url.searchParams.get('to');

  if (testPhone) {
    const cleanPhone = testPhone.replace(/[^0-9]/g, '');

    // Basic phone number validation: must be 10-15 digits
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      results.checks.sendMessage = { error: 'Número inválido (debe tener 10-15 dígitos)' };
      results.error = 'Número de teléfono inválido. Debe contener entre 10 y 15 dígitos.';
      return NextResponse.json(results, { status: 400 });
    }

    {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const sendResponse = await fetch(
          `https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: cleanPhone,
              type: 'text',
              text: {
                body: 'Prueba desde Archii - Bot funcionando correctamente!',
                preview_url: false,
              },
            }),
          }
        );
        clearTimeout(timeout);

        const sendData = await sendResponse.json();

        results.checks.sendMessage = {
          to: cleanPhone,
          status: sendResponse.status,
          ok: sendResponse.ok,
          data: sendData,
        };

        if (sendResponse.ok) {
          results.checks.sendMessageSuccess = true;
          results.message = 'TODO BIEN - Token valido, telefono verificado y mensaje enviado exitosamente!';
        } else {
          results.checks.sendMessageSuccess = false;
          results.error = `Error enviando mensaje: ${sendData.error?.message || JSON.stringify(sendData)}`;
        }
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          results.checks.sendMessage = { to: cleanPhone, error: 'timeout' };
          results.error = 'La petición de envío excedió el tiempo límite (10s).';
        } else {
          results.checks.sendMessage = {
            to: cleanPhone,
            error: err.message,
          };
          results.error = `Error de red al enviar mensaje: ${err.message}`;
        }
      }
    }
  } else {
    results.message = 'Configuracion OK. Agrega ?to=TU_NUMERO para enviar un mensaje de prueba.';
  }

  return NextResponse.json(results, { status: 200 });
}
