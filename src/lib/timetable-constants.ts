export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
// Slot index: 0=9-10, 1=10-11, 2=11-12, [lunch 12-1], 3=1-2, 4=2-3, 5=3-4
export const SLOT_LABELS = [
  "9:00 AM - 10:00 AM",
  "10:00 AM - 11:00 AM",
  "11:00 AM - 12:00 PM",
  "1:00 PM - 2:00 PM",
  "2:00 PM - 3:00 PM",
  "3:00 PM - 4:00 PM",
];
export const MORNING_SLOTS = [0, 1, 2];
export const AFTERNOON_SLOTS = [3, 4, 5];
// Valid 2-hour start slots — restricted to 9–11 AM (slot 0) and 2–4 PM (slot 4)
export const TWO_HOUR_STARTS = [0, 4];
