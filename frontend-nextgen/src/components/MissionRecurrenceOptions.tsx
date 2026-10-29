export type MissionRecurrence = {
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
};

interface MissionRecurrenceOptionsProps {
  value: MissionRecurrence | null;
  onChange: (value: MissionRecurrence | null) => void;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const MissionRecurrenceOptions = ({ value, onChange }: MissionRecurrenceOptionsProps) => (
  <div className="mission-recurrence">
    <label className="mission-recurrence-toggle">
      <input
        type="checkbox"
        checked={value !== null}
        onChange={(event) => onChange(event.target.checked ? { frequency: 'daily', time: '09:00' } : null)}
      />
      Repeat this mission
    </label>
    {value && (
      <div className="mission-recurrence-fields">
        <label>
          Repeat
          <select
            value={value.frequency}
            onChange={(event) => onChange({
              ...value,
              frequency: event.target.value as MissionRecurrence['frequency'],
            })}
          >
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
            <option value="monthly">Every month</option>
          </select>
        </label>
        {value.frequency === 'weekly' && (
          <label>
            Day of the week
            <select
              value={value.dayOfWeek ?? 1}
              onChange={(event) => onChange({ ...value, dayOfWeek: Number(event.target.value) })}
            >
              {WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </label>
        )}
        {value.frequency === 'monthly' && (
          <label>
            Day of the month
            <select
              value={value.dayOfMonth ?? 1}
              onChange={(event) => onChange({ ...value, dayOfMonth: Number(event.target.value) })}
            >
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Time (UTC)
          <input
            type="time"
            value={value.time}
            onChange={(event) => onChange({ ...value, time: event.target.value })}
            required
          />
        </label>
        <span className="hint">
          Scheduled missions run at this time using UTC.
          {value.frequency === 'monthly' && ' Days 29-31 only run in months that include that date.'}
        </span>
      </div>
    )}
  </div>
);
