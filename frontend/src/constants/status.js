import { Clock, Send, CheckCircle2, XCircle } from "lucide-react";
import { C, T } from "../styles/palette";

export const STATUS = {
  // Getter so a theme switch is picked up without a reload.
  pending:     { label: "Pending",     get color() { return C.sub; }, bg: T.greenBg, icon: Clock },
  in_progress: { label: "In Progress", color: C.blue,    bg: T.blueBg, icon: Clock },
  edited:      { label: "Edited",      color: C.warn,    bg: T.orangeBg, icon: Clock },
  submitted:   { label: "In Review",   color: T.purple, bg: T.purpleBg, icon: Send },
  approved:    { label: "Approved",    color: C.ok,      bg: T.greenBg, icon: CheckCircle2 },
  rejected:    { label: "Rejected",    color: C.danger,  bg: T.redBg, icon: XCircle },
};
