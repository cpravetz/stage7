import { logger } from '@stage7-nextgen/shared';
import { ToolCredentials, CredentialProvider } from '../services/CredentialProvider';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type CalendarAction = 'create' | 'update' | 'list' | 'delete' | 'check_availability' | 'export';

export interface CalendarAttendee {
  email: string;
  name?: string;
}

export interface CalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  attendees: CalendarAttendee[];
  createdAt?: string;
  lastModified?: string;
}

export interface BusyInterval {
  attendee?: string;
  start: string;
  end: string;
}

export interface CalendarOptions {
  action: CalendarAction;
  /** File name (relative to the base dir) or an absolute path. Defaults to 'default.ics'. */
  calendarPath?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  durationMinutes?: number;
  attendees?: CalendarAttendee[];
  uid?: string;
  /** Range filters for `list`. */
  rangeStart?: string;
  rangeEnd?: string;
  /** Working window and busy intervals for `check_availability`. */
  windowStart?: string;
  windowEnd?: string;
  slotMinutes?: number;
  busy?: BusyInterval[];
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  free: boolean;
  busyWith: string[];
}

export interface AvailabilityResult {
  windowStart: string;
  windowEnd: string;
  slotMinutes: number;
  slots: AvailabilitySlot[];
  freeSlotCount: number;
}

export interface CalendarResult {
  success: boolean;
  event?: CalendarEvent;
  events?: CalendarEvent[];
  availability?: AvailabilityResult;
  ics?: string;
  error?: string;
}

const CRLF = '\r\n';
const MAX_OCTETS = 75;
const DEFAULT_CALENDAR_FILE = 'default.ics';
const PRODID = '-//Stage7 NextGen//CalendarExecutor//EN';

class CalendarError extends Error {}

// ---------------------------------------------------------------------------
// RFC 5545 text escaping
// ---------------------------------------------------------------------------

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n');
}

function unescapeText(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '\\' && i + 1 < value.length) {
      const next = value[i + 1];
      if (next === 'n' || next === 'N') {
        out += '\n';
        i++;
        continue;
      }
      if (next === '\\' || next === ';' || next === ',') {
        out += next;
        i++;
        continue;
      }
      out += next;
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

// ---------------------------------------------------------------------------
// RFC 5545 line folding (75 octets, continuation lines start with one space)
// ---------------------------------------------------------------------------

function foldLine(line: string): string[] {
  if (Buffer.byteLength(line, 'utf8') <= MAX_OCTETS) {
    return [line];
  }
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  let isFirst = true;
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, 'utf8');
    const budget = isFirst ? MAX_OCTETS : MAX_OCTETS - 1; // continuation lines spend 1 octet on the leading space
    if (currentBytes + chBytes > budget) {
      parts.push(isFirst ? current : ` ${current}`);
      isFirst = false;
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  parts.push(isFirst ? current : ` ${current}`);
  return parts;
}

function unfoldLines(text: string): string[] {
  const physical = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const logical: string[] = [];
  for (const line of physical) {
    if (line === '') continue;
    if ((line.startsWith(' ') || line.startsWith('\t')) && logical.length > 0) {
      logical[logical.length - 1] += line.slice(1);
      continue;
    }
    logical.push(line);
  }
  return logical;
}

function foldDocument(lines: string[]): string {
  const out: string[] = [];
  for (const line of lines) {
    for (const folded of foldLine(line)) {
      out.push(folded);
    }
  }
  return `${out.join(CRLF)}${CRLF}`;
}

// ---------------------------------------------------------------------------
// Date handling -- all timestamps are stored and returned as ISO 8601 UTC.
// ---------------------------------------------------------------------------

function parseDateInput(value: unknown, field: string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new CalendarError(`${field} is an invalid Date`);
    }
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value);
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CalendarError(`${field} is required and must be an ISO 8601 date string`);
  }
  const ms = Date.parse(value.trim());
  if (Number.isNaN(ms)) {
    throw new CalendarError(`${field} is not a valid date: '${value}'`);
  }
  return new Date(ms);
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function toIcsUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function fromIcsUtc(value: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!match) {
    const parsed = Date.parse(value.trim());
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }
  const [, y, mo, d, h, mi, s] = match;
  const ms = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h || 0),
    Number(mi || 0),
    Number(s || 0)
  );
  return Number.isNaN(ms) ? null : new Date(ms);
}

// ---------------------------------------------------------------------------
// Serialisation / parsing
// ---------------------------------------------------------------------------

function paramValue(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const trimmed = name.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function formatAttendee(attendee: CalendarAttendee): string {
  const email = attendee.email.trim();
  // Limit length to prevent ReDoS on crafted input
  if (email.length > 320) {
    throw new CalendarError(`Invalid attendee email address: too long`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CalendarError(`Invalid attendee email address: '${attendee.email}'`);
  }
  if (attendee.name && attendee.name.trim() !== '') {
    const name = attendee.name.replace(/[";:,]/g, '');
    return `ATTENDEE;CN=${name}:mailto:${email}`;
  }
  return `ATTENDEE:mailto:${email}`;
}

function parseAttendee(line: string): CalendarAttendee | null {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) return null;
  const left = line.slice('ATTENDEE'.length, colonIndex);
  const value = line.slice(colonIndex + 1);
  const email = value.replace(/^mailto:/i, '').trim();
  if (!email) return null;
  const cnMatch = /;\s*CN=("(?:[^"]*)"|[^;:]*)/i.exec(left);
  const name = cnMatch ? unescapeText(paramValue(cnMatch[1]) ?? '') : undefined;
  return name ? { email, name } : { email };
}

function eventToLines(event: CalendarEvent, dtstamp: string): string[] {
  const lines: string[] = ['BEGIN:VEVENT'];
  lines.push(`UID:${event.uid}`);
  lines.push(`DTSTAMP:${toIcsUtc(dtstampDate(dtstamp))}`);
  lines.push(`DTSTART:${toIcsUtc(new Date(event.start))}`);
  lines.push(`DTEND:${toIcsUtc(new Date(event.end))}`);
  lines.push(`SUMMARY:${escapeText(event.summary)}`);
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeText(event.location)}`);
  }
  if (event.createdAt) {
    lines.push(`CREATED:${toIcsUtc(new Date(event.createdAt))}`);
  }
  if (event.lastModified) {
    lines.push(`LAST-MODIFIED:${toIcsUtc(new Date(event.lastModified))}`);
  }
  for (const attendee of event.attendees) {
    lines.push(formatAttendee(attendee));
  }
  lines.push('END:VEVENT');
  return lines;
}

function dtstampDate(value: string): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function calendarEnvelope(eventLines: string[][]): string[] {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${PRODID}`, 'CALSCALE:GREGORIAN'];
  for (const block of eventLines) {
    lines.push(...block);
  }
  lines.push('END:VCALENDAR');
  return lines;
}

function parseEventBlock(lines: string[]): CalendarEvent | null {
  const get = (name: string): string | undefined => {
    for (const line of lines) {
      if (line.toUpperCase().startsWith(`${name}:`) || line.toUpperCase().startsWith(`${name};`)) {
        return line.slice(line.indexOf(':') + 1);
      }
    }
    return undefined;
  };

  const uid = get('UID');
  const summaryRaw = get('SUMMARY');
  const startRaw = get('DTSTART');
  if (!uid || !summaryRaw || !startRaw) return null;

  const start = fromIcsUtc(startRaw);
  if (!start) return null;
  const endRaw = get('DTEND');
  const end = endRaw ? fromIcsUtc(endRaw) : null;
  const durationRaw = get('DURATION');
  const finalEnd = end ?? (durationRaw ? new Date(start.getTime()) : new Date(start.getTime() + 3600000));

  const attendees: CalendarAttendee[] = [];
  for (const line of lines) {
    if (line.toUpperCase().startsWith('ATTENDEE')) {
      const attendee = parseAttendee(line);
      if (attendee) attendees.push(attendee);
    }
  }

  const event: CalendarEvent = {
    uid: unescapeText(uid),
    summary: unescapeText(summaryRaw),
    start: start.toISOString(),
    end: finalEnd.toISOString(),
    attendees,
  };
  const description = get('DESCRIPTION');
  if (description) event.description = unescapeText(description);
  const location = get('LOCATION');
  if (location) event.location = unescapeText(location);
  const created = get('CREATED');
  if (created) {
    const d = fromIcsUtc(created);
    if (d) event.createdAt = d.toISOString();
  }
  const modified = get('LAST-MODIFIED');
  if (modified) {
    const d = fromIcsUtc(modified);
    if (d) event.lastModified = d.toISOString();
  }
  return event;
}

/** Parses an entire .ics document into VEVENT blocks. */
function parseIcs(text: string): CalendarEvent[] {
  const lines = unfoldLines(text);
  const events: CalendarEvent[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') {
      current = [];
      continue;
    }
    if (upper === 'END:VEVENT') {
      if (current) {
        const event = parseEventBlock(current);
        if (event) events.push(event);
      }
      current = null;
      continue;
    }
    if (current) current.push(line);
  }
  return events;
}

function serializeCalendar(events: CalendarEvent[]): string {
  const now = new Date();
  const blocks = events.map((event) => eventToLines(event, now.toISOString()));
  return foldDocument(calendarEnvelope(blocks));
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export class CalendarExecutor {
  private credentialProvider = CredentialProvider;
  private basePath: string;

  constructor() {
    this.basePath = process.env.CALENDAR_BASE_PATH || '/tmp/stage7-calendars';
  }

  async execute(options: CalendarOptions, _credentials: ToolCredentials): Promise<CalendarResult> {
    const action = options.action;
    logger.info({ action }, 'Calendar action started');

    try {
      if (action !== 'check_availability' && action !== 'list' && !this.knownAction(action)) {
        return { success: false, error: `Unsupported calendar action '${String(action)}'` };
      }

      switch (action) {
        case 'create':
          return await this.create(options);
        case 'update':
          return await this.update(options);
        case 'delete':
          return await this.remove(options);
        case 'list':
          return await this.list(options);
        case 'check_availability':
          return await this.checkAvailability(options);
        case 'export':
          return await this.exportCalendar(options);
        default:
          return { success: false, error: `Unsupported calendar action '${String(action)}'` };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ action, error }, 'Calendar action failed');
      return { success: false, error };
    }
  }

  private knownAction(action: CalendarAction): boolean {
    return ['create', 'update', 'delete', 'list', 'check_availability', 'export'].includes(action);
  }

  private resolveFile(calendarPath?: string): string {
    const requested = (calendarPath && calendarPath.trim()) || DEFAULT_CALENDAR_FILE;
    const resolved = path.isAbsolute(requested)
      ? path.resolve(requested)
      : path.resolve(this.basePath, requested);
    const root = path.resolve(this.basePath);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new CalendarError(
        `calendarPath must stay within the calendar base directory (${root}); received '${requested}'`
      );
    }
    if (!resolved.toLowerCase().endsWith('.ics')) {
      throw new CalendarError(`calendarPath must reference an .ics file, received '${requested}'`);
    }
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    return resolved;
  }

  private read(file: string): CalendarEvent[] {
    if (!fs.existsSync(file)) return [];
    const text = fs.readFileSync(file, 'utf-8');
    if (text.trim() === '') return [];
    return parseIcs(text);
  }

  private write(file: string, events: CalendarEvent[]): void {
    fs.writeFileSync(file, serializeCalendar(events), 'utf-8');
  }

  private buildEvent(options: CalendarOptions, existing?: CalendarEvent): CalendarEvent {
    const summary = (options.summary ?? existing?.summary ?? '').trim();
    if (!summary) {
      throw new CalendarError('summary is required and must be a non-empty string');
    }

    const startSource = options.start ?? existing?.start;
    if (!startSource) {
      throw new CalendarError('start is required and must be an ISO 8601 date string');
    }
    const start = parseDateInput(startSource, 'start');

    const durationMinutes = options.durationMinutes;
    if (durationMinutes !== undefined && (!Number.isFinite(durationMinutes) || durationMinutes <= 0)) {
      throw new CalendarError('durationMinutes must be a positive number');
    }

    let end: Date;
    if (options.end !== undefined) {
      end = parseDateInput(options.end, 'end');
    } else if (durationMinutes !== undefined) {
      end = new Date(start.getTime() + durationMinutes * 60000);
    } else if (existing?.end) {
      end = new Date(existing.end);
    } else {
      end = new Date(start.getTime() + 3600000);
    }

    if (end.getTime() <= start.getTime()) {
      throw new CalendarError('end must be strictly after start');
    }

    const attendees = options.attendees ?? existing?.attendees ?? [];
    if (!Array.isArray(attendees)) {
      throw new CalendarError('attendees must be an array of { email, name? } objects');
    }
    for (const attendee of attendees) {
      if (!attendee || typeof attendee.email !== 'string' || attendee.email.trim() === '') {
        throw new CalendarError('Each attendee requires an email address');
      }
    }

    const now = new Date().toISOString();
    const event: CalendarEvent = {
      uid: existing?.uid || options.uid?.trim() || `${crypto.randomUUID()}@stage7-calendar`,
      summary,
      start: start.toISOString(),
      end: end.toISOString(),
      attendees,
      createdAt: existing?.createdAt || now,
      lastModified: now,
    };
    const description = options.description ?? existing?.description;
    if (description) event.description = description;
    const location = options.location ?? existing?.location;
    if (location) event.location = location;
    return event;
  }

  private async create(options: CalendarOptions): Promise<CalendarResult> {
    const file = this.resolveFile(options.calendarPath);
    const event = this.buildEvent(options);
    const events = this.read(file);
    events.push(event);
    this.write(file, events);
    logger.info({ action: 'create', uid: event.uid, file }, 'Calendar event created');
    return { success: true, event };
  }

  private async update(options: CalendarOptions): Promise<CalendarResult> {
    const file = this.resolveFile(options.calendarPath);
    const events = this.read(file);
    const uid = (options.uid || options.summary || '').trim();
    if (!uid) {
      return { success: false, error: 'uid is required for the update action' };
    }
    const index = events.findIndex((e) => e.uid === uid);
    if (index === -1) {
      return { success: false, error: `No event with uid '${uid}' found in ${file}` };
    }
    const updated = this.buildEvent(options, events[index]);
    events[index] = updated;
    this.write(file, events);
    logger.info({ action: 'update', uid: updated.uid, file }, 'Calendar event updated');
    return { success: true, event: updated };
  }

  private async remove(options: CalendarOptions): Promise<CalendarResult> {
    const file = this.resolveFile(options.calendarPath);
    const events = this.read(file);
    const uid = (options.uid || '').trim();
    if (!uid) {
      return { success: false, error: 'uid is required for the delete action' };
    }
    const index = events.findIndex((e) => e.uid === uid);
    if (index === -1) {
      return { success: false, error: `No event with uid '${uid}' found in ${file}` };
    }
    const [removed] = events.splice(index, 1);
    this.write(file, events);
    logger.info({ action: 'delete', uid: removed.uid, file }, 'Calendar event deleted');
    return { success: true, event: removed };
  }

  private async list(options: CalendarOptions): Promise<CalendarResult> {
    const file = this.resolveFile(options.calendarPath);
    if (!fs.existsSync(file)) {
      return { success: true, events: [], ics: '' };
    }
    const events = this.read(file);
    let filtered = events;
    if (options.rangeStart !== undefined) {
      const from = parseDateInput(options.rangeStart, 'rangeStart').getTime();
      filtered = filtered.filter((e) => new Date(e.end).getTime() >= from);
    }
    if (options.rangeEnd !== undefined) {
      const to = parseDateInput(options.rangeEnd, 'rangeEnd').getTime();
      filtered = filtered.filter((e) => new Date(e.start).getTime() <= to);
    }
    filtered = [...filtered].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    logger.info({ action: 'list', file, count: filtered.length }, 'Calendar events listed');
    return { success: true, events: filtered, ics: serializeCalendar(filtered) };
  }

  private async checkAvailability(options: CalendarOptions): Promise<CalendarResult> {
    const windowStart = parseDateInput(options.windowStart ?? options.start, 'windowStart');
    const windowEnd = parseDateInput(options.windowEnd ?? options.end, 'windowEnd');
    if (windowEnd.getTime() <= windowStart.getTime()) {
      return { success: false, error: 'windowEnd must be strictly after windowStart' };
    }
    const slotMinutes = options.slotMinutes ?? 30;
    if (!Number.isFinite(slotMinutes) || slotMinutes <= 0) {
      return { success: false, error: 'slotMinutes must be a positive number' };
    }

    const busyIntervals = (options.busy || []).map((interval, index) => {
      const start = parseDateInput(interval.start, `busy[${index}].start`);
      const end = parseDateInput(interval.end, `busy[${index}].end`);
      if (end.getTime() <= start.getTime()) {
        throw new CalendarError(`busy[${index}].end must be strictly after busy[${index}].start`);
      }
      return { attendee: interval.attendee || 'unknown', start: start.getTime(), end: end.getTime() };
    });

    const slotMs = slotMinutes * 60000;
    const slots: AvailabilitySlot[] = [];
    for (let t = windowStart.getTime(); t + slotMs <= windowEnd.getTime(); t += slotMs) {
      const slotEnd = t + slotMs;
      const conflicts = busyIntervals.filter((b) => b.start < slotEnd && b.end > t);
      slots.push({
        start: new Date(t).toISOString(),
        end: new Date(slotEnd).toISOString(),
        free: conflicts.length === 0,
        busyWith: [...new Set(conflicts.map((c) => c.attendee))],
      });
    }

    const availability: AvailabilityResult = {
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      slotMinutes,
      slots,
      freeSlotCount: slots.filter((s) => s.free).length,
    };
    logger.info(
      { action: 'check_availability', slots: slots.length, free: availability.freeSlotCount },
      'Availability computed'
    );
    return { success: true, availability };
  }

  private async exportCalendar(options: CalendarOptions): Promise<CalendarResult> {
    const file = this.resolveFile(options.calendarPath);
    if (!fs.existsSync(file)) {
      return { success: true, ics: foldDocument(calendarEnvelope([])) };
    }
    const events = this.read(file);
    if (options.uid) {
      const uid = options.uid.trim();
      const matches = events.filter((e) => e.uid === uid);
      if (matches.length === 0) {
        return { success: false, error: `No event with uid '${uid}' found in ${file}` };
      }
      const ics = serializeCalendar(matches);
      return { success: true, event: matches[0], ics };
    }
    const ics = serializeCalendar(events);
    logger.info({ action: 'export', file, count: events.length }, 'Calendar exported');
    return { success: true, events, ics };
  }
}
