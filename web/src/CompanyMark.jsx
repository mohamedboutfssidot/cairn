import { useState } from "react";

// Repère visuel de l'entreprise : le logo quand la source en fournit un (seules
// RemoteOK, Remotive et Jobicy le font) et qu'il se charge, sinon une pastille
// avec l'initiale -> chaque offre a toujours une image, jamais un trou.
function initialOf(company) {
  const cleaned = (company || "")
    .replace(/^\(slug:\s*/i, "")   // edwarddgao : "(slug: xxx — url)"
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
  return (cleaned[0] || "?").toUpperCase();
}

function hueOf(company) {
  let h = 0;
  for (const ch of company || "?") h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

export default function CompanyMark({ company, logoUrl, size = "sm" }) {
  const [failed, setFailed] = useState(false);
  const showLogo = logoUrl && !failed;

  return (
    <span
      className={`company-mark company-mark--${size}`}
      style={showLogo ? undefined : { "--mark-hue": hueOf(company) }}
      aria-hidden="true"
    >
      {showLogo ? (
        <img src={logoUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        initialOf(company)
      )}
    </span>
  );
}
