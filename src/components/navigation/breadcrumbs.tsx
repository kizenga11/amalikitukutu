"use client";

import { navIcons, type Crumb, type NavKey } from "./nav-config";

export default function Breadcrumbs({
  items,
  onNavigate,
}: {
  items: Crumb[];
  onNavigate?: (key: NavKey) => void;
}) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((crumb, index) => {
        const isLast = index === items.length - 1;
        const clickable = !isLast && !!crumb.key && !!onNavigate;
        return (
          <span className="crumbs-seg" key={`${crumb.label}-${index}`}>
            {index > 0 && <span className="crumbs-sep" aria-hidden="true">{navIcons.chevronRight}</span>}
            {clickable ? (
              <button type="button" className="crumbs-link" onClick={() => onNavigate!(crumb.key!)}>
                {crumb.label}
              </button>
            ) : (
              <span className={`crumbs-text${isLast ? " crumbs-text--current" : ""}`} aria-current={isLast ? "page" : undefined}>
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
