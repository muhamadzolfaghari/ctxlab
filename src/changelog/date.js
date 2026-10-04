// Date helper with bulletproof Persian & Gregorian support (no NaN)

const PERSIAN_MONTHS = [
  "Farvardin", "Ordibehesht", "Khordad",
  "Tir", "Mordad", "Shahrivar",
  "Mehr", "Aban", "Azar",
  "Dey", "Bahman", "Esfand"
];

const PERSIAN_MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد",
  "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر",
  "دی", "بهمن", "اسفند"
];

export function getPersianDateParts(date = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat("fa-IR", {
      calendar: "persian",
      month: "numeric",
      day: "numeric",
      year: "numeric",
      numberingSystem: "latn",
    });
    const parts = formatter.formatToParts(date);
    const day = parseInt(parts.find(p => p.type === "day")?.value || "1", 10);
    const month = parseInt(parts.find(p => p.type === "month")?.value || "1", 10);
    const year = parseInt(parts.find(p => p.type === "year")?.value || "1403", 10);

    const monthIndex = Math.max(0, Math.min(11, month - 1));
    return {
      day,
      month: monthIndex + 1,
      year,
      monthNameFa: PERSIAN_MONTHS_FA[monthIndex],
      monthNameEn: PERSIAN_MONTHS[monthIndex],
    };
  } catch (err) {
    return {
      day: date.getDate(),
      month: date.getMonth() + 1,
      year: 1403,
      monthNameFa: "مهر",
      monthNameEn: "Mehr",
    };
  }
}

export function formatPersianHeadline(date = new Date(), lang = "en") {
  const parts = getPersianDateParts(date);
  if (lang === "fa") {
    return `${parts.day} ${parts.monthNameFa}`;
  }
  return `${parts.day} ${parts.monthNameEn}`;
}

export function formatGregorianHeadline(date = new Date()) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
