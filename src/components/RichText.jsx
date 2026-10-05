import React from "react";
import { richRuns } from "../../shared/richText.js";

/**
 * Text a model wrote, with its *emphasis* shown as emphasis. Emphasised bits
 * are film titles as a rule, so the translator leaves them alone.
 */
export default function RichText({ children }) {
  if (typeof children !== "string") return children ?? null;
  return richRuns(children).map((r, i) =>
    r.em ? <em key={i} translate="no">{r.text}</em>
      : r.strong ? <strong key={i} className="font-semibold">{r.text}</strong>
      : <React.Fragment key={i}>{r.text}</React.Fragment>);
}
