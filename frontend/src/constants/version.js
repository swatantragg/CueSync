export const APP_VERSION = "3.1.1";

// Shown once per user after sign-in whenever APP_VERSION changes.
export const CHANGELOG = [
  {
    title: "Serial name check on work files",
    body: "If a work file's title names a different serial, you're asked whether it's the right file with a name written differently, or the wrong file. Only files you confirm are uploaded. Differences in spacing or capital letters don't count.",
  },
  {
    title: "Work files",
    body: "Editors can upload the per-episode work file next to the rough sheet. Episodes with one show a Work file tag; click it to download.",
  },
  {
    title: "Right file, right place",
    body: "A work file is rejected by Import Rough Sheet and a rough sheet is rejected by Upload Work File. Work files with mismatched episode numbers are flagged before saving.",
  },
  {
    title: "Download All",
    body: "Reviewers can download the IPRS, PRS and ASCAP sheets plus the work file for an episode range as one ZIP, or the work file alone.",
  },
  {
    title: "Find songs by name",
    body: "Start typing a song title and matching songs from the library are suggested, just like when you type the IPRS Internal Number or ISRC. Pick one to fill in the song details.",
  },
  {
    title: "IPRS Internal Number",
    body: "The Song Code field is now called IPRS Internal Number.",
  },
  {
    title: "Tidier song details",
    body: "Singer now sits beside the Validation Link, just above the contributors.",
  },
];
