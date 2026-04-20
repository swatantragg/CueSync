import { uid } from "../utils/uid";

export function buildSeedData() {
  const contribs = () => [
    { id: uid(), name: "Sabuj Mukherjee", role: "Composer", society: "IPRS", share: 25, ipi: "1280461760" },
    { id: uid(), name: "Ashish Kumar Das", role: "Composer", society: "IPRS", share: 25, ipi: "1173883723" },
    { id: uid(), name: "Star India Private Limited", role: "Publisher", society: "NS", share: 50, ipi: "" },
  ];
  const mkCue = (t, u, d, sc) => ({
    id: uid(), songTitle: t, usageType: u, duration: d, usages: 1,
    songCode: sc, isrc: "", singer: "", workNumber: "", ascapWorkId: "", validationLink: "",
    contributors: contribs(),
  });

  return [{
    id: "proj1", type: "Serial", title: "Kothha", serialType: "SOAPS", language: "Bengali",
    genre: "Drama, Romance, Comedy", productionCompany: "Bangla Talkies",
    director: "Suman Das", producer: "Nitesh Sharma, Nandini Sharma",
    actors: "Sushmita Dey, Saheb Bhattacharya", year: "2023",
    channel: "Star Jalsha", countryOfOrigin: "India", productionNumber: "",
    backgroundMusicComposer: "Sabuj-Aashish", submittedBy: "Sabuj-Aashish",
    episodes: [
      { id: "ep51", number: 51, title: "", airDate: "03 February 2024",
        totalDuration: "00:22:38", musicalDuration: "00:21:09", bgInstrumental: "00:09:09", bgVocal: "00:05:39",
        status: "approved", uploadedBy: "u1", uploadedAt: "2024-04-10 09:15",
        editHistory: [
          { userId: "u1", name: "Rahul Sharma", action: "Uploaded rough sheet", at: "2024-04-10 09:15" },
          { userId: "u1", name: "Rahul Sharma", action: "Filled contributor details for 3 songs", at: "2024-04-10 10:30" },
          { userId: "u2", name: "Priya Nair", action: "Updated ISRC & Song Codes", at: "2024-04-10 14:22" },
          { userId: "u1", name: "Rahul Sharma", action: "Submitted for approval", at: "2024-04-10 15:00" },
          { userId: "u3", name: "Admin Samraj", action: "Approved", at: "2024-04-11 09:00" },
        ],
        cues: [
          mkCue("Kothha Background Instrumental", "Background Instrumental", "00:09:10", "30715504"),
          mkCue("Agnibha Theme", "Background Vocal", "00:00:20", "30715498"),
          mkCue("Kothhakali Theme", "Background Vocal", "00:02:27", "30715500"),
        ],
      },
      { id: "ep52", number: 52, title: "", airDate: "04 February 2024",
        totalDuration: "00:22:11", musicalDuration: "00:20:37", bgInstrumental: "00:13:06", bgVocal: "00:04:02",
        status: "submitted", uploadedBy: "u2", uploadedAt: "2024-04-11 11:00",
        editHistory: [
          { userId: "u2", name: "Priya Nair", action: "Uploaded rough sheet", at: "2024-04-11 11:00" },
          { userId: "u2", name: "Priya Nair", action: "Filled all song details", at: "2024-04-11 13:45" },
          { userId: "u2", name: "Priya Nair", action: "Submitted for approval", at: "2024-04-11 14:00" },
        ],
        cues: [
          mkCue("Kothha Background Instrumental", "Background Instrumental", "00:13:10", "30715504"),
          mkCue("Kakima Theme", "Background Vocal", "00:00:18", "30715497"),
        ],
      },
      { id: "ep53", number: 53, title: "", airDate: "05 February 2024",
        totalDuration: "00:22:48", musicalDuration: "00:21:31", bgInstrumental: "00:14:07", bgVocal: "00:00:06",
        status: "rejected",
        rejectionNote: "Song Code missing for 'Montu Da Theme'. Also verify singer name for Agnibha Theme — currently shows 'Sabuj-Ashish' but IPRS catalogue has 'Sabuj Mukherjee'. Please correct and resubmit.",
        uploadedBy: "u1", uploadedAt: "2024-04-12 08:30",
        editHistory: [
          { userId: "u1", name: "Rahul Sharma", action: "Uploaded rough sheet", at: "2024-04-12 08:30" },
          { userId: "u1", name: "Rahul Sharma", action: "Filled partial song details", at: "2024-04-12 10:00" },
          { userId: "u1", name: "Rahul Sharma", action: "Submitted for approval", at: "2024-04-12 11:00" },
          { userId: "u3", name: "Admin Samraj", action: "Rejected — Song Code missing for Montu Da Theme", at: "2024-04-12 16:30" },
        ],
        cues: [
          mkCue("Kothha Background Instrumental", "Background Instrumental", "00:15:05", "30715504"),
          mkCue("Montu Da Theme", "Background Instrumental", "00:00:26", ""),
          mkCue("Agnibha Theme", "Background Instrumental", "00:01:27", "30715498"),
        ],
      },
      { id: "ep54", number: 54, title: "", airDate: "06 February 2024",
        totalDuration: "00:22:30", musicalDuration: "00:20:10", bgInstrumental: "00:12:00", bgVocal: "00:03:10",
        status: "in_progress", uploadedBy: "u2", uploadedAt: "2024-04-13 09:00",
        editHistory: [
          { userId: "u2", name: "Priya Nair", action: "Uploaded rough sheet", at: "2024-04-13 09:00" },
          { userId: "u2", name: "Priya Nair", action: "Started filling contributor details", at: "2024-04-13 10:15" },
        ],
        cues: [
          mkCue("Kothha Background Instrumental", "Background Instrumental", "00:12:00", "30715504"),
          mkCue("Kothhakali Theme", "Background Vocal", "00:01:50", "30715500"),
        ],
      },
      { id: "ep55", number: 55, title: "", airDate: "07 February 2024",
        totalDuration: "00:22:15", musicalDuration: "00:19:45", bgInstrumental: "00:11:30", bgVocal: "00:03:00",
        status: "pending", uploadedBy: "u1", uploadedAt: "2024-04-14 08:00",
        editHistory: [{ userId: "u1", name: "Rahul Sharma", action: "Uploaded rough sheet", at: "2024-04-14 08:00" }],
        cues: [mkCue("Kothha Background Instrumental", "Background Instrumental", "00:11:30", "")],
      },
    ],
  }];
}

export function buildNotifications() {
  return [
    { id: "n1", type: "rejection", serial: "Kothha", epNum: 53, message: "Song Code missing for 'Montu Da Theme'. Also verify singer name for Agnibha Theme.", from: "Admin Samraj", at: "2024-04-12 16:30", read: false },
    { id: "n2", type: "approval", serial: "Kothha", epNum: 51, message: "Episode 51 has been approved. Cue sheets are ready for export.", from: "Admin Samraj", at: "2024-04-11 09:00", read: true },
  ];
}
