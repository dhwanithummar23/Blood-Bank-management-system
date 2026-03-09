/**
 * Logic to check if a blood bank is open based on IST
 * @param {string} timing - Example: "09:00 AM - 09:00 PM" or "24x7"
 * @returns {boolean}
 */
const getOpenStatus = (timing) => {
  if (!timing) return false;

  // 1. Handle 24x7 case
  const normalizedTiming = timing.toLowerCase().replace(/\s/g, "");
  if (
    normalizedTiming.includes("24x7") ||
    normalizedTiming.includes("24hours")
  ) {
    return true;
  }

  try {
    // 2. Get current time in India (IST)
    const now = new Date();
    const indiaTime = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(now);

    const currentHour = parseInt(
      indiaTime.find((p) => p.type === "hour").value,
    );
    const currentMinute = parseInt(
      indiaTime.find((p) => p.type === "minute").value,
    );
    const currentTimeInMinutes = currentHour * 60 + currentMinute;

    // 3. Parse the timing string (Expected format: "HH:MM AM - HH:MM PM")
    const times = timing.split("-");
    if (times.length !== 2) return false;

    const convertToMinutes = (timeStr) => {
      const [time, modifier] = timeStr.trim().split(" ");
      let [hours, minutes] = time.split(":").map(Number);

      if (modifier === "PM" && hours < 12) hours += 12;
      if (modifier === "AM" && hours === 12) hours = 0;

      return hours * 60 + minutes;
    };

    const startTime = convertToMinutes(times[0]);
    const endTime = convertToMinutes(times[1]);

    // 4. Check if current time falls within range
    // Handles overnight shifts (e.g., 8:00 PM - 2:00 AM)
    if (startTime < endTime) {
      return (
        currentTimeInMinutes >= startTime && currentTimeInMinutes <= endTime
      );
    } else {
      // Overnight case
      return (
        currentTimeInMinutes >= startTime || currentTimeInMinutes <= endTime
      );
    }
  } catch (err) {
    console.error("Error parsing time for badge:", err);
    return false;
  }
};

module.exports = getOpenStatus;
