export const USAGE_MAP = {
  "Background Instrumental": ["BI", "B", "BI"],
  "Background Vocal": ["BV", "B", "BV"],
  "Featured Vocal": ["FV", "F", "VV"],
  "Featured Instrumental": ["FI", "F", "VI"],
  "Visual Vocal": ["VV", "F", "VV"],
  "Visual Instrumental": ["VI", "F", "VI"],
  "Opening / Title": ["OI", "F", "MT"],
  "End Title": ["OI", "F", "ET"],
};

export const CODE_REVERSE = {
  BI: "Background Instrumental", BV: "Background Vocal",
  FV: "Featured Vocal", FI: "Featured Instrumental",
  OI: "Opening / Title", VI: "Visual Instrumental", VV: "Visual Vocal",
};

export const iprsCode = (t) => USAGE_MAP[t]?.[0] || "";
export const prsCode = (t) => USAGE_MAP[t]?.[1] || "";
export const ascapCode = (t) => USAGE_MAP[t]?.[2] || "";
