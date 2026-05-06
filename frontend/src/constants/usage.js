export const USAGE_MAP = {
  bi: ["BI", "B", "BI"],
  bv: ["BV", "B", "BV"],
  fi: ["FI", "F", "VI"],
  fv: ["FV", "F", "VV"],
  oi: ["OI", "F", "MT"],
  ci: ["CI", "F", "ET"],
  BI: ["BI", "B", "BI"],
  BV: ["BV", "B", "BV"],
  FI: ["FI", "F", "VI"],
  FV: ["FV", "F", "VV"],
  OI: ["OI", "F", "MT"],
  CI: ["CI", "F", "ET"],
  "Background Instrumental": ["BI", "B", "BI"],
  "Background Vocal": ["BV", "B", "BV"],
  "Featured Vocal": ["FV", "F", "VV"],
  "Featured Instrumental": ["FI", "F", "VI"],
  "Visual Vocal": ["VV", "F", "VV"],
  "Visual Instrumental": ["VI", "F", "VI"],
  "Opening / Title": ["OI", "F", "MT"],
  "End Title": ["CI", "F", "ET"],
};

export const CODE_REVERSE = {
  BI: "bi", BV: "bv",
  FV: "fv", FI: "fi",
  OI: "oi", CI: "ci",
  VI: "Visual Instrumental", VV: "Visual Vocal",
};

export const USAGE_LABELS = {
  bi: "BI - BG Instrumental",
  bv: "BV - BG Vocal",
  fi: "FI - Feature Instrumental",
  fv: "FV - Feature Vocal",
  oi: "OI - Opening Instrumental",
  ci: "CI - Closing Instrumental",
  theme: "Theme",
  visual: "Visual",
  other: "Other",
  background: "BI - BG Instrumental",
  instrumental: "BI - BG Instrumental",
  vocal: "BV - BG Vocal",
};

export const iprsCode = (t) => USAGE_MAP[t]?.[0] || "";
export const prsCode = (t) => USAGE_MAP[t]?.[1] || "";
export const ascapCode = (t) => USAGE_MAP[t]?.[2] || "";
