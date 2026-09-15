export interface AethexTokenResponse {
  token: string;
  expires_in: number;
  expires_at: string;
  agent_id: string;
}

export interface MintAethexTokenOptions {
  agentId: string;
  ttlSeconds?: number;
}

export async function mintAethexConversationToken(
  options: MintAethexTokenOptions
): Promise<AethexTokenResponse> {
  const apiKey = process.env.AETHEX_API_KEY;
  if (!apiKey) {
    throw new AethexConfigurationError('AETHEX_API_KEY is not configured');
  }

  const apiBaseUrl = (
    process.env.AETHEX_API_BASE_URL || 'https://api.aethexai.com/api/v1'
  ).replace(/\/+$/, '');

  const response = await fetch(`${apiBaseUrl}/conversation/token`, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_id: options.agentId,
      ...(options.ttlSeconds === undefined ? {} : { ttl_seconds: options.ttlSeconds }),
    }),
  });

  const body = await readJsonOrText(response);
  if (!response.ok) {
    throw new AethexUpstreamError(response.status, body);
  }

  if (!isAethexTokenResponse(body)) {
    throw new AethexUpstreamError(502, {
      error: 'Aethex returned an invalid token response',
    });
  }

  return body;
}

export class AethexConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AethexConfigurationError';
  }
}

export class AethexUpstreamError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(`Aethex token request failed with status ${status}`);
    this.name = 'AethexUpstreamError';
  }
}

async function readJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isAethexTokenResponse(value: unknown): value is AethexTokenResponse {
  if (!isRecord(value)) return false;

  return (
    typeof value.token === 'string' &&
    typeof value.expires_in === 'number' &&
    typeof value.expires_at === 'string' &&
    typeof value.agent_id === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
