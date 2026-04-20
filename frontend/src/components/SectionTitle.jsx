import { FONTS } from "../styles/palette";

export default function SectionTitle({ title }) {
  return <h3 className="text-2xl mb-4" style={{ fontFamily: FONTS.serif }}>{title}</h3>;
}
