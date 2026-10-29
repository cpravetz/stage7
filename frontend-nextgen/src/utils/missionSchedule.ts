export function describeMissionSchedule(cron: string): string {
  const [minuteText, hourText, dayOfMonth, , dayOfWeek] = cron.split(' ');
  const minute = Number(minuteText);
  const hour = Number(hourText);
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) return 'Custom schedule (UTC)';

  const time = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2020, 0, 1, hour, minute)));

  if (dayOfWeek !== '*') {
    const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(dayOfWeek)];
    return weekday ? `Every ${weekday} at ${time} UTC` : 'Custom schedule (UTC)';
  }
  if (dayOfMonth !== '*') return `Monthly on day ${dayOfMonth} at ${time} UTC`;
  return `Every day at ${time} UTC`;
}
