import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";

const PORTAL_JWT_ISSUER = "somma-portal";
const PORTAL_JWT_EXPIRATION = "7d";

interface PortalTokenPayload {
  ownerId: string;
  ownerName: string;
  type: "portal";
}

function getSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET nao configurado");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Gera um JWT para o portal do proprietario.
 */
export async function signPortalToken(payload: {
  ownerId: string;
  ownerName: string;
}): Promise<string> {
  const token = await new SignJWT({
    ownerId: payload.ownerId,
    ownerName: payload.ownerName,
    type: "portal" as const,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(PORTAL_JWT_ISSUER)
    .setExpirationTime(PORTAL_JWT_EXPIRATION)
    .sign(getSecret());

  return token;
}

/**
 * Verifica o JWT do portal a partir do header Authorization: Bearer <token>.
 * Retorna { ownerId, ownerName } ou null se invalido.
 */
export async function verifyPortalToken(
  request: NextRequest
): Promise<PortalTokenPayload | null> {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.substring(7);
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: PORTAL_JWT_ISSUER,
    });

    if (payload.type !== "portal" || !payload.ownerId || !payload.ownerName) {
      return null;
    }

    return {
      ownerId: payload.ownerId as string,
      ownerName: payload.ownerName as string,
      type: "portal",
    };
  } catch {
    return null;
  }
}
