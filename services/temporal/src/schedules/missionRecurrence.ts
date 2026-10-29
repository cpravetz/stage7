import { z } from 'zod';

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const missionRecurrenceSchema = z.discriminatedUnion('frequency', [
  z.object({
    frequency: z.literal('daily'),
    time: timeSchema,
  }).strict(),
  z.object({
    frequency: z.literal('weekly'),
    time: timeSchema,
    dayOfWeek: z.number().int().min(0).max(6),
  }).strict(),
  z.object({
    frequency: z.literal('monthly'),
    time: timeSchema,
    dayOfMonth: z.number().int().min(1).max(31),
  }).strict(),
]);

export type MissionRecurrence = z.infer<typeof missionRecurrenceSchema>;

export function missionRecurrenceToCron(recurrence: MissionRecurrence): string {
  const [hour, minute] = recurrence.time.split(':').map(Number);
  const dayOfMonth = recurrence.frequency === 'monthly' ? recurrence.dayOfMonth : '*';
  const dayOfWeek = recurrence.frequency === 'weekly' ? recurrence.dayOfWeek : '*';
  return `${minute} ${hour} ${dayOfMonth} * ${dayOfWeek}`;
}
