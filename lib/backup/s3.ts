import { createHash, createHmac } from "node:crypto";

/**
 * Minimaler S3-Client (AWS Signature Version 4) ohne zusätzliche Bibliothek.
 * Funktioniert mit jedem S3-kompatiblen Speicher: Cloudflare R2, AWS S3, Backblaze B2, Hetzner, IONOS …
 * Pfad-Adressierung: <endpoint>/<bucket>/<schlüssel>. Zugangsdaten werden nie protokolliert.
 */
export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

const hex = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();

/** RFC-3986-Kodierung wie von AWS verlangt */
export function awsEncode(s: string) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Signiert eine Anfrage (liefert die zu sendenden Kopfzeilen).
 * `headers` müssen mindestens host enthalten; x-amz-date und x-amz-content-sha256 werden ergänzt.
 */
export function signV4(input: {
  method: string;
  url: URL;
  headers: Record<string, string>;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
  date?: Date;
}): Record<string, string> {
  const service = input.service ?? "s3";
  const d = input.date ?? new Date();
  const amzDate = d.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers)) headers[k.toLowerCase()] = String(v).trim().replace(/\s+/g, " ");
  headers["x-amz-date"] = amzDate;
  headers["x-amz-content-sha256"] = input.payloadHash;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const query = [...input.url.searchParams.entries()]
    .map(([k, v]) => [awsEncode(k), awsEncode(v)] as const)
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const path = input.url.pathname
    .split("/")
    .map((seg) => awsEncode(decodeURIComponent(seg)))
    .join("/");
  const canonicalRequest = [input.method, path || "/", query, canonicalHeaders, signedHeaders, input.payloadHash].join("\n");
  const scope = `${day}/${input.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, hex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${input.secretAccessKey}`, day);
  const kSigning = hmac(hmac(hmac(kDate, input.region), service), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

export class S3Error extends Error {
  override name = "S3Error";
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

const HINTS: Record<string, string> = {
  InvalidAccessKeyId: "Zugangsschlüssel unbekannt – Token gelöscht oder falsch eingetragen",
  SignatureDoesNotMatch: "Geheimer Schlüssel passt nicht zum Zugangsschlüssel",
  AccessDenied: "Token hat keinen Zugriff auf diesen Bucket",
  NoSuchBucket: "Bucket nicht gefunden – Name oder Endpoint prüfen (bei EU-Buckets enthält der Endpoint „.eu.“)",
};

/** Verständliche Fehlermeldung mit dem Fehlercode des Speichers (z. B. AccessDenied) – nie mit Zugangsdaten */
async function failure(action: string, res: Response): Promise<S3Error> {
  const body = await res.text().catch(() => "");
  const code = body.match(/<Code>([A-Za-z]{1,64})<\/Code>/)?.[1];
  const hint = code ? (HINTS[code] ? `${code}: ${HINTS[code]}` : code) : "";
  return new S3Error(`${action} fehlgeschlagen (HTTP ${res.status}${hint ? ` – ${hint}` : ""})`, res.status);
}

const TIMEOUT = () => Number(process.env.BACKUP_S3_TIMEOUT_MS) || 60_000;

export function s3Client(cfg: S3Config) {
  const base = new URL(cfg.endpoint.replace(/\/$/, ""));
  // Häufiger Eintragungsfehler: Endpoint mit angehängtem Bucket-Namen (so zeigt ihn Cloudflare an) → Bucket-Namen entfernen
  if (base.pathname.replace(/\/$/, "").endsWith(`/${cfg.bucket}`)) base.pathname = base.pathname.replace(/\/$/, "").slice(0, -(cfg.bucket.length + 1)) || "/";
  const objectUrl = (key: string, params?: Record<string, string>) => {
    const u = new URL(`${base.origin}${base.pathname.replace(/\/$/, "")}/${awsEncode(cfg.bucket)}/${key.split("/").map((s) => awsEncode(s)).join("/")}`);
    for (const [k, v] of Object.entries(params ?? {})) u.searchParams.set(k, v);
    return u;
  };
  async function request(method: string, url: URL, body?: Buffer, extra: Record<string, string> = {}) {
    const payload = body ?? Buffer.alloc(0);
    const headers = signV4({ method, url, headers: { host: url.host, ...extra }, payloadHash: hex(payload), accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region: cfg.region });
    delete headers.host; // setzt fetch selbst
    let res: Response;
    try {
      res = await fetch(url, { method, headers, body: body ? new Uint8Array(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT()) });
    } catch (e) {
      throw new S3Error(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "Speicher antwortet nicht (Zeitüberschreitung)" : "Speicher nicht erreichbar");
    }
    return res;
  }
  return {
    async put(key: string, data: Buffer, contentType = "application/octet-stream") {
      const res = await request("PUT", objectUrl(key), data, { "content-type": contentType, "content-length": String(data.length) });
      if (!res.ok) throw await failure("Hochladen", res);
      await res.arrayBuffer().catch(() => undefined);
    },
    async get(key: string): Promise<Buffer | null> {
      const res = await request("GET", objectUrl(key));
      if (res.status === 404) return null;
      if (!res.ok) throw await failure("Herunterladen", res);
      return Buffer.from(await res.arrayBuffer());
    },
    async del(key: string) {
      const res = await request("DELETE", objectUrl(key));
      if (!res.ok && res.status !== 404) throw await failure("Löschen", res);
      await res.arrayBuffer().catch(() => undefined);
    },
    async list(prefix: string): Promise<{ key: string; size: number; lastModified: string }[]> {
      const out: { key: string; size: number; lastModified: string }[] = [];
      let token: string | undefined;
      for (let page = 0; page < 100; page++) {
        const params: Record<string, string> = { "list-type": "2", prefix, "max-keys": "1000" };
        if (token) params["continuation-token"] = token;
        const u = new URL(`${base.origin}${base.pathname.replace(/\/$/, "")}/${awsEncode(cfg.bucket)}`);
        for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
        const res = await request("GET", u);
        if (!res.ok) throw await failure("Auflisten", res);
        const xml = await res.text();
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const tag = (n: string) => m[1].match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))?.[1] ?? "";
          out.push({ key: xmlDecode(tag("Key")), size: Number(tag("Size")) || 0, lastModified: tag("LastModified") });
        }
        const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
        token = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1];
        if (!truncated || !token) break;
        token = xmlDecode(token);
      }
      return out;
    },
  };
}

const xmlDecode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
