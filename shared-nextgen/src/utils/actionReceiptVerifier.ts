export type RequiredActionLike = {
  toolId: string;
  outcome: 'success' | 'failure' | 'denied' | string;
  operation?: string;
  operations?: string[];
  recipient?: string;
  recipients?: string[];
  message?: string;
  subject?: string;
  body?: string;
  binding?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ActionReceiptLike = {
  toolId: string;
  outcome: string;
  isError?: boolean;
  content?: string;
  executionId?: string;
  operation?: string;
  providerRequestId?: string;
  fallbackForToolId?: string;
  binding?: Record<string, unknown>;
  [key: string]: unknown;
};

const MESSAGE_TOOLS = new Set([
  'email_sender', 'send_email', 'email',
  'sms_sender', 'send_sms', 'text-service-twilio-sms', 'twilio_sms',
]);

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase();
  return normalized || undefined;
}

function normalizeRecipient(value: unknown): string | undefined {
  const text = normalizeText(value);
  if (!text) return undefined;
  if (text.includes('@')) return text;
  const digits = text.replace(/[^\d+]/g, '');
  if (digits.length >= 7) return digits.startsWith('+') ? digits : `+${digits.replace(/^\+/, '')}`;
  return text;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function pickArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      const items = value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : []);
      if (items.length > 0) return items;
    }
    if (typeof value === 'string' && value.trim()) return [value.trim()];
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function parseContent(content?: string): Record<string, unknown> | undefined {
  if (!content) return undefined;
  try {
    return asRecord(JSON.parse(content));
  } catch {
    return undefined;
  }
}

function nestedRecords(record?: Record<string, unknown>): Record<string, unknown>[] {
  if (!record) return [];
  return [record, record.result, record.output, record.data, record.response, record.message, record.reconciliation]
    .flatMap((value) => {
      const rec = asRecord(value);
      return rec ? [rec] : [];
    });
}

export function inferReceiptOperation(toolId: string, record?: Record<string, unknown>): string | undefined {
  const explicit = pickString(record?.operation, record?.action, asRecord(record?.result)?.operation, asRecord(record?.output)?.operation);
  if (explicit) return normalizeText(explicit);
  const id = toolId.toLowerCase();
  if (id.includes('email') || id === 'send_email') return 'send_email';
  if (id.includes('sms') || id.includes('twilio') || id.includes('text_message') || id === 'send_sms') return 'send_sms';
  if (id.includes('webhook')) return 'webhook';
  return normalizeText(toolId);
}

export function extractReceiptBinding(receipt: ActionReceiptLike): {
  operation?: string;
  recipients?: string[];
  message?: string;
  subject?: string;
  body?: string;
  providerRequestId?: string;
  executionId?: string;
} {
  const content = parseContent(receipt.content);
  const binding = asRecord(receipt.binding) || asRecord(content?.binding);
  const records = nestedRecords(content);
  const find = (picker: (record: Record<string, unknown>) => string | undefined): string | undefined => {
    if (binding) {
      const value = picker(binding);
      if (value) return value;
    }
    for (const record of records) {
      const value = picker(record);
      if (value) return value;
    }
    return undefined;
  };
  const recipients = [
    ...pickArray(binding?.recipients),
    ...records.flatMap((record) => pickArray(record.to, record.recipients, record.recipient, record.phone, record.email)),
  ];
  return {
    operation: pickString(receipt.operation, find((r) => pickString(r.operation, r.action)), inferReceiptOperation(receipt.toolId, content)),
    recipients: recipients.length > 0 ? recipients : undefined,
    message: find((r) => pickString(r.message, r.body, r.text, r.content, r.subject)),
    subject: find((r) => pickString(r.subject, r.title)),
    body: find((r) => pickString(r.body, r.message, r.text, r.content)),
    providerRequestId: pickString(receipt.providerRequestId, find((r) => pickString(r.providerRequestId, r.messageId, r.sid, r.requestId, r.id))),
    executionId: pickString(receipt.executionId, find((r) => pickString(r.executionId))),
  };
}

function normalizedRequired(required: RequiredActionLike): RequiredActionLike {
  const binding = asRecord(required.binding) || {};
  const recipients = [...pickArray(required.recipients), ...pickArray(required.recipient), ...pickArray(binding.recipients)];
  return {
    ...required,
    operation: pickString(required.operation, binding.operation),
    operations: pickArray(required.operations),
    recipients: recipients.length > 0 ? recipients : undefined,
    message: pickString(required.message, binding.message),
    subject: pickString(required.subject, binding.subject),
    body: pickString(required.body, binding.body),
  };
}

function textMatches(expected: unknown, actualValues: Array<string | undefined>): boolean {
  const normalizedExpected = normalizeText(expected);
  if (!normalizedExpected) return true;
  const haystack = actualValues.flatMap((value) => {
    const normalized = normalizeText(value);
    return normalized ? [normalized] : [];
  });
  return haystack.some((value) => value === normalizedExpected || value.includes(normalizedExpected) || normalizedExpected.includes(value));
}

function recipientMatches(expected: string[] | undefined, actual: string[] | undefined): boolean {
  if (!expected || expected.length === 0) return true;
  if (!actual || actual.length === 0) return false;
  const normalizedActual = actual.map(normalizeRecipient).filter((value): value is string => Boolean(value));
  return expected
    .map(normalizeRecipient)
    .filter((value): value is string => Boolean(value))
    .every((recipient) => normalizedActual.some((candidate) => candidate === recipient || candidate.includes(recipient) || recipient.includes(candidate)));
}

function operationMatches(required: RequiredActionLike, receipt: ActionReceiptLike, binding: ReturnType<typeof extractReceiptBinding>): boolean {
  const expectedOps = [required.operation, ...(required.operations || [])].map(normalizeText).filter((value): value is string => Boolean(value));
  if (expectedOps.length === 0) {
    if (required.outcome !== 'success') return true;
    if (!MESSAGE_TOOLS.has(required.toolId.toLowerCase()) && !MESSAGE_TOOLS.has(receipt.toolId.toLowerCase())) return true;
    const receiptOp = normalizeText(binding.operation);
    return !receiptOp || receiptOp.includes('send') || receiptOp.includes('deliver');
  }
  const actual = normalizeText(binding.operation) || normalizeText(receipt.toolId);
  return Boolean(actual && expectedOps.some((expected) => actual === expected || actual.includes(expected) || expected.includes(actual)));
}

export function receiptMatchesRequiredAction(receipt: ActionReceiptLike, requiredInput: RequiredActionLike): boolean {
  const required = normalizedRequired(requiredInput);
  const toolMatches = receipt.toolId === required.toolId
    || (receipt.toolId !== '__create_tool'
      && required.outcome === 'success'
      && receipt.outcome === 'success'
      && receipt.fallbackForToolId === required.toolId)
    || (required.toolId === '__external_action__' && !['__list_tools', '__create_tool', '__delegate', '__external_action__'].includes(receipt.toolId));
  if (!toolMatches || receipt.outcome !== required.outcome) return false;

  const binding = extractReceiptBinding(receipt);
  if (!operationMatches(required, receipt, binding)) return false;
  if (!recipientMatches(required.recipients, binding.recipients)) return false;
  if (!textMatches(required.subject, [binding.subject, binding.message])) return false;
  if (!textMatches(required.body, [binding.body, binding.message])) return false;
  if (!textMatches(required.message, [binding.message, binding.body, binding.subject])) return false;
  return true;
}

export function describeRequiredAction(requiredInput: RequiredActionLike): string {
  const required = normalizedRequired(requiredInput);
  const parts = [required.toolId, required.operation, ...(required.recipients || []), required.subject, required.body, required.message]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return parts.length > 1 ? `${required.toolId} (${parts.slice(1).join(', ')})` : required.toolId;
}
