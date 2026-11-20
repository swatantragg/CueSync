export const APP_VERSION = "4.3.2";

// `roles`: who sees the entry in the What's New popup. Admins see every entry, so they can track each release.
const ADMIN = [], WD = ["work_delegator"], REVIEWER = ["reviewer"], EDITOR = ["editor"];
const STAFF = ["work_delegator", "reviewer"];
const ALL = ["work_delegator", "reviewer", "editor", "viewer"];

export const CHANGELOG = [
  {
    version: "4.3.2", roles: WD,
    title: "Movies in theatres wait for their video",
    body: "A new work now says where it is released first: Theatres first, OTT or TV. A movie in theatres has no video to work from yet, so it shows Waiting for video and its fingerprinting stays locked until you tick Video available, saying where the video came from (streaming on OTT with its link, a copy from the client, TV or other). While it waits, the 5-day reminders and the 15/30-day flags hold off and count from the day the video came.",
  },
  {
    version: "4.3.2", roles: WD,
    title: "Is it on OTT yet?",
    body: "Add the OTT date and platform when they are announced. If not, pick the usual gap after release (8 weeks for Hindi films, 4 weeks for South Indian films). CueSync asks on that day whether the movie is streaming, then every 7 days until the video is in, and flags it if there is still no video 90 days after release. These are in the bell's Reminders tab, the Waiting for video tile and your weekly report.",
  },
  {
    version: "4.3.2", roles: ADMIN,
    title: "Waiting for video, and why weekly emails weren't arriving",
    body: "New Work tracks movies released in theatres until their video is available, with OTT reminders for Admins and Work Delegators. Dashboard → Weekly email reports now lists each thing the email needs (switched on, Brevo key and sender, server allowed by Brevo, sending active, sender domain authenticated) and what to fix.",
  },
  {
    version: "4.3.1", roles: WD,
    title: "Client, release date and video link on every new work",
    body: "Adding a movie or TV show to the New Work List now asks for its client (required), and you can add the release date and a video link. They show under the title, in the list's new Client and Release columns, and the list filters by client and by release date. Edit them any time with the pencil. Allotting the cue sheet work picks the same client for you.",
  },
  {
    version: "4.3.1", roles: WD,
    title: "Release day updates",
    body: "When the release date you enter is still ahead, CueSync sends you an update on the release day and again 7 days after, saying where the work stands (BGM, fingerprinting or cue sheet) and whether it has a video link. They are in the bell's Reminders tab and the tracking log. Change the date and the updates follow the new one.",
  },
  {
    version: "4.3.1", roles: ADMIN,
    title: "New Work: client, release date and video link",
    body: "Each new work now names its client and can carry a release date and video link. Admins and Work Delegators get an update on a future release date and 7 days after it. A client used by a new work can no longer be deleted, only deactivated.",
  },
  {
    version: "4.3.0", roles: WD,
    title: "New Work List",
    body: "Add a new movie or TV show the moment you get its name, even before the BGM arrives. The New Work tab lists every one with its work type, date added, BGM received, fingerprinting, cue sheet work, current status, days pending and remarks, and filters by work type, assigned person, status and pending time.",
  },
  {
    version: "4.3.0", roles: WD,
    title: "A new serial or movie is now three steps",
    body: "New Work opens the steps: 1 BGM received (tick the box, the date is saved), 2 Fingerprinting (pick the editor from the list), 3 Cue sheet work (the usual allotment). Each step stays locked until the one before it is completed. You can skip a step, but you must say why. New Delegation stays for more work on a title that already exists.",
  },
  {
    version: "4.3.0", roles: WD,
    title: "Fingerprinting waits for the BMAT email",
    body: "The Fingerprinting Completed box is enabled when BMAT Vericast Team emails musicpublishing@joshuainc.in about that title. If no email came, type where the fingerprinting came from and the box is enabled; that is saved as a manual entry. An Admin connects the mailbox once under New Work → BMAT emails.",
  },
  {
    version: "4.3.0", roles: WD,
    title: "Reminders every 5 days",
    body: "A step left waiting is chased every 5 days until it is done: BGM not received, fingerprinting pending, cue sheet work not allotted. Works still not allotted 15 and 30 days after they were added are flagged. Reminders are under New Work → Reminders and in the bell's new Reminders tab, and stop by themselves.",
  },
  {
    version: "4.3.0", roles: WD,
    title: "New work on your Dashboard and weekly report",
    body: "Your Dashboard shows the New Work numbers above Editors and their serials: total added, awaiting BGM, BGM received, fingerprinting not assigned, in progress and completed, cue sheet allocation pending and in progress, completed works, and works pending over 15 and 30 days. The weekly report carries the same numbers and the works to follow up. Every step, manual or automatic, is in New Work → Tracking log.",
  },
  {
    version: "4.3.0", roles: ADMIN,
    title: "New Work for admins",
    body: "The Admin Dashboard shows the same New Work numbers, there is a New Work tab with the list, reminders and tracking log, and the admin weekly report includes them. Connect musicpublishing@joshuainc.in under New Work → BMAT emails (read-only) so CueSync can see the BMAT Vericast emails.",
  },
  {
    version: "4.3.0", roles: EDITOR,
    title: "Fingerprinting assigned to you",
    body: "Fingerprinting a Work Delegator assigns to you now appears on your Dashboard. Set it to In progress, and tick Fingerprinting Completed once the BMAT Vericast email has arrived. If no email came, type where the fingerprinting came from to enable the box.",
  },
  {
    version: "4.2.0", roles: REVIEWER,
    title: "Conversion: one format in, all three out",
    body: "Projects has a new Conversion tab. Pick Serial or Movie, choose the title from the list or add a new one, pick the client, and upload a finished cue sheet in IPRS, PRS or ASCAP format. CueSync works out which format it is, shows the episodes it found, and gives you the IPRS, PRS and ASCAP sheets.",
  },
  {
    version: "4.2.0", roles: REVIEWER,
    title: "Converted sheets are kept",
    body: "Every conversion is saved under its serial or movie. Download any episode range again in one format or all three as a ZIP, from Conversion or from the new Converted tab of the serial or movie. Uploading an episode again replaces its earlier conversion.",
  },
  {
    version: "4.2.0", roles: REVIEWER,
    title: "Email converted sheets to a society",
    body: "Send converted sheets from the client's Gmail to a society the same way as Submit Cue: you see and edit the email first, and it is recorded in Submit Cue with replies and bounces tracked.",
  },
  {
    version: "4.1.2", roles: ALL,
    title: "Fits every screen",
    body: "CueSync now uses the full width of the window, with no empty space left and right, in every browser from a phone to a wide monitor. Changing the font size changes only the text.",
  },
  {
    version: "4.1.2", roles: ALL,
    title: "Clearer pop-ups and notifications",
    body: "Pop-ups are now frosted glass with the page blurred behind them. When several notifications arrive they line up one under another and leave one at a time, oldest first.",
  },
  {
    version: "4.1.2", roles: ALL,
    title: "Sign in with Google",
    body: "Use Continue with Google on the sign-in page with the Google account of your CueSync email. Your password keeps working too.",
  },
  {
    version: "4.1.2", roles: WD,
    title: "Notify an editor by email",
    body: "Every editor needing attention has a Notify button, and so does every editor under Editors and their serials. It writes the email for you, with why they're flagged and their pending work by client; check it and send.",
  },
  {
    version: "4.1.2", roles: WD,
    title: "Emails go from your own Gmail",
    body: "The first time you notify an editor, connect your Gmail on Google's page. It must be the same address as your CueSync account, and CueSync can only send from it, never read it.",
  },
  {
    version: "4.1.2", roles: WD,
    title: "Sharper list of who needs attention",
    body: "Editors are now also flagged for not working on an allotted serial at all, alongside nothing submitted, being behind target and a low approval rate.",
  },
  {
    version: "4.1.2", roles: WD,
    title: "Your weekly email report",
    body: "Each week: the work you allotted, how much each client's work was received, submitted and is still pending, and how each of your editors did.",
  },
  {
    version: "4.1.2", roles: EDITOR,
    title: "Your Dashboard",
    body: "The new first tab shows the work allotted to you client by client, how much of it is done, in review, to do or overdue, and how you're doing this week.",
  },
  {
    version: "4.1.2", roles: EDITOR,
    title: "Progress graphs",
    body: "See your work by week, month or year: submitted against approved, approved against rejected, and how much you completed on time.",
  },
  {
    version: "4.1.2", roles: EDITOR,
    title: "Emails from your Work Delegator",
    body: "If your Work Delegator emails you about pending work, the email also appears on your Dashboard with the full list, until you mark it as read.",
  },
  {
    version: "4.1.2", roles: EDITOR,
    title: "Your weekly email report",
    body: "Each week: what you completed, what's pending by client, the reviewers' notes to act on, and whether the week counted as performing well, decent or underperforming.",
  },
  {
    version: "4.1.2", roles: REVIEWER,
    title: "Activity calendar on your Dashboard",
    body: "The Activity Calendar moved to the Dashboard and its tab is gone. It now tracks everything month by month: episodes submitted, approved, rejected and sent back for changes, what's still waiting, and emails sent, waiting for a reply, accepted or failed. Filter by client or society, and click a month for its weeks, societies, clients and reviewers.",
  },
  {
    version: "4.1.2", roles: REVIEWER,
    title: "Your weekly email report",
    body: "Each week: which client's work went to which society, what's pending review, what's approved but not sent, and which emails are still waiting for a reply.",
  },
  {
    version: "4.1.2", roles: ADMIN,
    title: "Weekly reports for everyone",
    body: "Editors, Work Delegators, reviewers and admins each get their own report by email every week, through Brevo. Your Dashboard shows when the next one goes and lets you preview each role or send yourself a test.",
  },
  {
    version: "4.1.2", roles: ADMIN,
    title: "Updates by role",
    body: "From now on this popup only tells people about changes to their own work. Admins still see everything, with a tag saying who each change is for.",
  },
  {
    version: "4.1.1", roles: WD,
    title: "Work Delegator Dashboard",
    body: "Work Delegations is now the Dashboard: the top 5 editors, the clients ordering the most, the work pipeline, editors needing attention and the quarterly calendar. New Delegation is a button at the top, on every tab. The Activity tab is gone — its calendar is on the Dashboard.",
  },
  {
    version: "4.1.1", roles: WD,
    title: "Pending work per client",
    body: "The Dashboard's Clients table splits each client's allotted episodes into in progress, approved by a reviewer and sent to a society, so pending is everything not sent yet. Click a client for its serials.",
  },
  {
    version: "4.1.1", roles: WD,
    title: "Editors and their serials",
    body: "One row per editor with every serial and movie allotted to them. Click a serial to edit it, or an editor to change status or delete an allotment. Editors with nothing allotted are listed too.",
  },
  {
    version: "4.1.1", roles: REVIEWER,
    title: "Pending review on the Reviewer Dashboard",
    body: "Episodes waiting for review are listed on the Dashboard, oldest first, with who submitted them and how long they've waited. Open and Review straight from there.",
  },
  {
    version: "4.1.0", roles: ADMIN,
    title: "Admin Dashboard",
    body: "Overview is now the Dashboard: this week's allotted, approved and sent work at a glance, the top 5 editors, the clients ordering the most, reviewers by episodes approved or sent to societies, and how much each Work Delegator allotted — each for the week (Monday to Saturday), month or year.",
  },
  {
    version: "4.1.0", roles: ADMIN,
    title: "Clients at a glance",
    body: "Every client with the cue sheets emailed to IPRS, PRS and ASCAP for them, and the serials and movies still pending — in editing, or approved but not sent yet. Click a client for the serials and latest emails.",
  },
  {
    version: "4.1.0", roles: ADMIN,
    title: "Who needs attention",
    body: "Editors behind their weekly target, with nothing submitted or many rejections, and reviewers below the team average, slow to review or with bounced emails, are listed for the week or month.",
  },
  {
    version: "4.1.0", roles: ADMIN,
    title: "Quarterly calendar",
    body: "The calendar now runs Q1 (Jan–Mar) to Q4 (Oct–Dec): episodes allotted, approved, sent to societies and still pending each month and quarter, for one client or society or all of them. Sent counts only cue sheets emailed from the client's Gmail.",
  },
  {
    version: "4.0.2", roles: REVIEWER,
    title: "Reviewer Dashboard",
    body: "Review Queue is now the Dashboard: every cue sheet email sent to IPRS, PRS and ASCAP, which are still waiting for an answer, which the society replied to, and which failed. Review submitted episodes from Projects — its tab shows how many are waiting.",
  },
  {
    version: "4.0.2", roles: REVIEWER,
    title: "Society replies and bounces",
    body: "CueSync reads the client's Gmail every few minutes (or when you click Check now). A society's reply shows on the Dashboard with Accepted by Society in one click; an email that bounced is marked Failed with a Resend button.",
  },
  {
    version: "4.0.2", roles: REVIEWER,
    title: "Emails sent outside CueSync",
    body: "Cue sheets emailed to a society straight from the client's Gmail are found in its Sent folder. Check the serial, episodes and society CueSync filled in, then Confirm — or mark it Not a cue sheet.",
  },
  {
    version: "4.0.2", roles: REVIEWER,
    title: "Approved episodes only",
    body: "In Submit Cue the episode pickers list only approved episodes, mark the ones already sent to the chosen society, and stop a range at the first episode that isn't approved.",
  },
  {
    version: "4.0.1", roles: REVIEWER,
    title: "Send to Society by email",
    body: "Submit Cue → Preview Email sends the cue sheets from the client's connected Gmail to the society. Before sending you see the whole email — From, To, CC, BCC, subject, message and the attached IPRS / PRS / ASCAP / work file — and can change any of it.",
  },
  {
    version: "4.0.1", roles: REVIEWER,
    title: "Societies",
    body: "Admins and Reviewers keep the society list under the new Societies tab: each society's email address, default CC and BCC, the files to attach and the email template.",
  },
  {
    version: "4.0.1", roles: REVIEWER,
    title: "Every entry has a real email",
    body: "A Submit Cue entry is created only after Gmail confirms the email was sent, and shows who sent it, from which mailbox and to whom. Episodes that are not approved, or were already sent to that society, can't be sent by mistake.",
  },
  {
    version: "4.0.0", roles: STAFF,
    title: "Client list",
    body: "Admins and Reviewers now keep one list of clients under the new Clients tab. Work Delegators and Reviewers pick the client from this list instead of typing it, so every delegation and submission uses the same name.",
  },
  {
    version: "4.0.0", roles: REVIEWER,
    title: "Connect a client's Gmail",
    body: "Each client's Gmail can be connected once with Connect Gmail: sign in on Google's own page and allow access. CueSync never stores the password, checks every day that the connection still works, and tells you if it needs reconnecting.",
  },
  {
    version: "4.0.0", roles: REVIEWER,
    title: "Old client names",
    body: "Client names typed before this update are listed under Clients → Old client names to link. Link each one to a client, or add it as a client, so all its work shows under one name.",
  },
  {
    version: "3.1.2", roles: ALL,
    title: "Activity timeline",
    body: "Every activity log — on an episode, in editor and reviewer activity, and sign-in history — is now a timeline: who did it, what happened and when, newest first, with one dot per step.",
  },
  {
    version: "3.1.1", roles: EDITOR,
    title: "Serial name check on work files",
    body: "If a work file's title names a different serial, you're asked whether it's the right file with a name written differently, or the wrong file. Only files you confirm are uploaded. Differences in spacing or capital letters don't count.",
  },
  {
    version: "3.1.0", roles: EDITOR,
    title: "Work files",
    body: "Editors can upload the per-episode work file next to the rough sheet. Episodes with one show a Work file tag; click it to download.",
  },
  {
    version: "3.1.0", roles: EDITOR,
    title: "Right file, right place",
    body: "A work file is rejected by Import Rough Sheet and a rough sheet is rejected by Upload Work File. Work files with mismatched episode numbers are flagged before saving.",
  },
  {
    version: "3.1.0", roles: REVIEWER,
    title: "Download All",
    body: "Reviewers can download the IPRS, PRS and ASCAP sheets plus the work file for an episode range as one ZIP, or the work file alone.",
  },
  {
    version: "3.0.0", roles: EDITOR,
    title: "Find songs by name",
    body: "Start typing a song title and matching songs from the library are suggested, just like when you type the IPRS Internal Number or ISRC. Pick one to fill in the song details.",
  },
  {
    version: "3.0.0", roles: EDITOR,
    title: "IPRS Internal Number",
    body: "The Song Code field is now called IPRS Internal Number.",
  },
  {
    version: "3.0.0", roles: EDITOR,
    title: "Tidier song details",
    body: "Singer now sits beside the Validation Link, just above the contributors.",
  },
];

const parts = (v) => String(v).split(".").map((n) => parseInt(n, 10) || 0);
const isNewer = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
};

// What the popup shows this user: their role's changes since they last dismissed it (just this release for a first sign-in).
export function whatsNewFor(role, lastSeen) {
  return CHANGELOG.filter((c) => (lastSeen ? isNewer(c.version, lastSeen) : c.version === APP_VERSION)
    && (role === "admin" || c.roles.includes(role)));
}
