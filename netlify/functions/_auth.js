// One shared place for JWT + CORS
import jwt from "jsonwebtoken";

export const headers = {
  "content-type": "application/json",
  "access-control-allow-origin": process.env.APP_ORIGIN || "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export function cors(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  return null;
}

function getBearer(event) {
  const h = event.headers || {};
  const raw = h.authorization || h.Authorization || "";
  return raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";
}

const SECRET = (process.env.JWT_SECRET || "dev").trim();

// 🔑 Create a JWT for a user
export function signToken(user) {
  const claims = { 
    sub: user.id, 
    username: user.username, 
    email: user.email,
    is_admin: user.is_admin || false   // include admin flag
  };
  return jwt.sign(claims, SECRET, { expiresIn: "7d" });
}

// 🔑 Generic token verification
export function getAuth(event) {
  const token = getBearer(event);
  if (!token) return { ok:false, statusCode:401, body:{ ok:false, error:"no_auth" } };
  try {
    const claims = jwt.verify(token, SECRET);
    return { ok:true, claims };
  } catch {
    return { ok:false, statusCode:401, body:{ ok:false, error:"invalid_token" } };
  }
}

// 🔑 Require admin privileges
export function authAdmin(event) {
  const auth = getAuth(event);
  if (!auth.ok) {
    throw new Error("invalid_token");
  }
  const claims = auth.claims;
  if (!claims.is_admin) {
    throw new Error("not_admin");
  }
  return claims;
}
