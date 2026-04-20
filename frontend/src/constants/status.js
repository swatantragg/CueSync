import { Clock, Send, CheckCircle2, XCircle } from "lucide-react";
import { C } from "../styles/palette";

export const STATUS = {
  pending:     { label: "Pending",     color: C.muted,   bg: "#E8F5E9", icon: Clock },
  in_progress: { label: "In Progress", color: C.blue,    bg: "#E3F2FD", icon: Clock },
  edited:      { label: "Edited",      color: C.warn,    bg: "#FFF3E0", icon: Clock },
  submitted:   { label: "Submitted",   color: "#7B1FA2", bg: "#F3E5F5", icon: Send },
  approved:    { label: "Approved",    color: C.ok,      bg: "#E8F5E9", icon: CheckCircle2 },
  rejected:    { label: "Rejected",    color: C.danger,  bg: "#FFEBEE", icon: XCircle },
};
