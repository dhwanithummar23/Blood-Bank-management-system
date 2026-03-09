document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("eligibilityForm");
  const submitBtn = document.getElementById("submitBtn");
  const resultBox = document.getElementById("eligibilityResult");
  const resultTitle = document.getElementById("resultTitle");
  const resultText = document.getElementById("resultText");
  const questionsCount = 10;

  // 1. Enable Submit Button only when all questions are answered
  form.addEventListener("change", () => {
    const formData = new FormData(form);
    let answeredCount = 0;

    // Check how many unique question names have a value
    for (let i = 1; i <= questionsCount; i++) {
      if (formData.has(`q${i}`)) answeredCount++;
    }

    submitBtn.disabled = answeredCount !== questionsCount;
  });

  // 2. Handle Form Submission
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);

    // Precise logic check
    const q1to2Yes = data.get("q1") === "Yes" && data.get("q2") === "Yes";

    // Check if q3 through q10 are all "No"
    let q3to10No = true;
    for (let i = 3; i <= 10; i++) {
      if (data.get(`q${i}`) !== "No") {
        q3to10No = false;
        break;
      }
    }

    const isEligible = q1to2Yes && q3to10No;
    displayResult(isEligible);
  });

  // 3. Display the Result
  function displayResult(eligible) {
    const headerSection = document.querySelector(".header-section");

    // Hide form and header
    form.style.display = "none";
    if (headerSection) headerSection.style.display = "none";

    resultBox.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (eligible) {
      resultTitle.innerText = "🎉 You are Eligible!";
      resultTitle.style.color = "#00c853";
      resultText.innerText =
        "Thank you! Your health profile meets the basic requirements for blood donation. Please proceed to find a blood bank near you.";
    } else {
      resultTitle.innerText = "📍 Not Eligible Right Now";
      resultTitle.style.color = "#e6004e";
      resultText.innerText =
        "Based on your answers, you may not be able to donate blood at this time. This could be due to recent health events, medications, or safety guidelines.";
    }
  }
});

/**
 * Robustly checks if the current time falls within a timing string (e.g., "9:00 AM - 5:00 PM")
 * Also handles overnight shifts (e.g., "10:00 PM - 6:00 AM")
 */
function getOpenStatus(timingString) {
  if (!timingString) return false;
  if (timingString.toLowerCase().includes("24x7")) return true;

  try {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const parts = timingString.split("-").map((s) => s.trim());
    if (parts.length !== 2) return false;

    const parseToMinutes = (timeStr) => {
      // Improved regex to handle various spacing and formats
      const match = timeStr.match(/(\d+)(?::(\d+))?\s*(AM|PM)/i);
      if (!match) return 0;

      let hours = parseInt(match[1]);
      let minutes = match[2] ? parseInt(match[2]) : 0;
      const modifier = match[3].toUpperCase();

      if (modifier === "PM" && hours !== 12) hours += 12;
      if (modifier === "AM" && hours === 12) hours = 0;

      return hours * 60 + minutes;
    };

    const startMinutes = parseToMinutes(parts[0]);
    let endMinutes = parseToMinutes(parts[1]);

    // LOGIC CORRECTION: Handle wrap-around time (overnight)
    if (endMinutes < startMinutes) {
      // It's open if it's AFTER start time OR BEFORE end time the next morning
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch (e) {
    console.error("Time parsing error:", e);
    return false;
  }
}
