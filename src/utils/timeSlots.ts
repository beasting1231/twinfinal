/**
 * Returns the correct time slots for a given date based on the seasonal schedule
 */
export function getTimeSlotsByDate(date: Date): string[] {
  const month = date.getMonth(); // 0 = January, 11 = December
  const day = date.getDate();

  // OCT 11 - OCT 31: 8:00, 9:15, 10:30, 12:00, 13:30, 14:45, 16:00
  if (month === 9 && day >= 11) { // October (month 9) from 11th onwards
    return ["8:00", "9:15", "10:30", "12:00", "13:30", "14:45", "16:00"];
  }

  // NOV: 8:00, 9:15, 10:30, 12:00, 13:30, 14:45, 16:00
  if (month === 10) { // November (month 10)
    return ["8:00", "9:15", "10:30", "12:00", "13:30", "14:45", "16:00"];
  }

  // DEC - JAN: 8:30, 9:45, 11:00, 12:15, 13:45, 15:00
  if (month === 11 || month === 0) { // December (month 11) or January (month 0)
    return ["8:30", "9:45", "11:00", "12:15", "13:45", "15:00"];
  }

  // FEB: 8:00, 9:15, 10:30, 12:00, 13:30, 14:45, 16:00
  if (month === 1) { // February (month 1)
    return ["8:00", "9:15", "10:30", "12:00", "13:30", "14:45", "16:00"];
  }

  // MAR: 7:30, 8:30, 9:45, 11:00, 12:15, 13:45, 15:00, 16:00
  if (month === 2) { // March (month 2)
    return ["7:30", "8:30", "9:45", "11:00", "12:15", "13:45", "15:00", "16:00"];
  }

  // APR - OCT 10: 7:30, 8:30, 9:45, 11:00, 12:30, 14:00, 15:30, 16:45
  if (month >= 3 && (month < 9 || (month === 9 && day <= 10))) { // April (3) through Oct 10
    return ["7:30", "8:30", "9:45", "11:00", "12:30", "14:00", "15:30", "16:45"];
  }

  // Default fallback (should not reach here with proper logic)
  return ["7:30", "8:30", "9:45", "11:00", "12:30", "14:00", "15:30", "16:45"];
}
