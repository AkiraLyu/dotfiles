function pad(value) {
  return String(value).padStart(2, '0');
}

export function calendarDateKey(year, monthIndex, day) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

export function buildCalendarMonth(year, monthIndex, recordedDates = new Set()) {
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const mondayFirstOffset = (firstDay + 6) % 7;
  const cells = Array.from({ length: mondayFirstOffset }, () => null);
  let count = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = calendarDateKey(year, monthIndex, day);
    const recorded = recordedDates.has(date);
    if (recorded) count += 1;
    cells.push({ day, date, recorded });
  }

  while (cells.length % 7) cells.push(null);
  return { year, monthIndex, count, cells };
}

export function buildCalendarYear(year, recordedDates = new Set()) {
  return Array.from({ length: 12 }, (_, monthIndex) => (
    buildCalendarMonth(year, monthIndex, recordedDates)
  ));
}
