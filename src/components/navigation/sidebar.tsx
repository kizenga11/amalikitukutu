"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  navIcons,
  visibleMenuFor,
  type MenuEntry,
  type NavKey,
  type Role,
} from "./nav-config";
import "./nav.css";

type SidebarProps = {
  role: Role;
  active: NavKey;
  /** The group that is currently open (single-open accordion). */
  openGroup: string | null;
  mobileOpen: boolean;
  onSelect: (key: NavKey) => void;
  onOpenGroup: (key: string) => void;
  onCloseMobile: () => void;
  /** Used to remember the collapsed state per user. */
  storageKey: string;
};

export default function Sidebar({
  role,
  active,
  openGroup,
  mobileOpen,
  onSelect,
  onOpenGroup,
  onCloseMobile,
  storageKey,
}: SidebarProps) {
  const entries = useMemo(() => visibleMenuFor(role), [role]);
  const collapseKey = `nav-collapsed:${storageKey}`;

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(collapseKey) === "1";
    } catch {
      return false;
    }
  });
  const [flyout, setFlyout] = useState<string | null>(null);
  const flyoutRef = useRef<HTMLDivElement | null>(null);

  /* Close the collapsed flyout when clicking outside (but let the group button toggle itself). */
  useEffect(() => {
    if (!flyout) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Element | null;
      if (flyoutRef.current && target && flyoutRef.current.contains(target)) return;
      if (target && typeof target.closest === "function" && target.closest(".sn-group")) return;
      setFlyout(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [flyout]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(collapseKey, next ? "1" : "0");
      } catch {
        /* storage blocked - ignore */
      }
      setFlyout(null);
      return next;
    });
  }

  function handleEntryClick(entry: MenuEntry) {
    if (entry.kind === "group") {
      if (collapsed) {
        setFlyout((current) => (current === entry.key ? null : entry.key));
      } else {
        onOpenGroup(entry.key);
      }
      return;
    }
    onSelect(entry.key);
    setFlyout(null);
  }

  return (
    <aside className={`sidebar${mobileOpen ? " sidebar--open" : ""}${collapsed ? " sidebar--collapsed" : ""}`}>
      <div className="sidebar-brand">
        <img className="brand-logo-img" src="/assets/logo.png" alt="Kitukutu Secondary Technical School logo" />
        <div className="sn-brand-text">
          <div className="sidebar-brand-name">Kitukutu Secondary Technical School</div>
        </div>
        <button className="sidebar-close" onClick={onCloseMobile} aria-label="Close menu">{navIcons.close}</button>
      </div>

      <nav className="side-nav">
        {entries.map((entry) => {
          if (entry.kind === "link") {
            const isActive = active === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                className={`sn-item${isActive ? " sn-item--active" : ""}`}
                onClick={() => handleEntryClick(entry)}
                title={collapsed ? entry.label : undefined}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="sn-icon">{entry.icon}</span>
                <span className="sn-label">{entry.label}</span>
              </button>
            );
          }

          const isOpen = openGroup === entry.key;
          const hasActive = entry.items.some((item) => item.key === active);
          return (
            <div key={entry.key} className={`sn-group${isOpen ? " sn-group--open" : ""}`}>
              <button
                type="button"
                className={`sn-group-btn${hasActive ? " sn-group-btn--active" : ""}`}
                onClick={() => handleEntryClick(entry)}
                aria-expanded={isOpen}
                title={collapsed ? entry.label : undefined}
              >
                <span className="sn-icon">{entry.icon}</span>
                <span className="sn-label">{entry.label}</span>
                <span className="sn-chev">{navIcons.chevron}</span>
              </button>

              {!collapsed && isOpen && (
                <div className="sn-sub">
                  {entry.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`sn-item sn-item--sub${active === item.key ? " sn-item--active" : ""}`}
                      onClick={() => onSelect(item.key)}
                      aria-current={active === item.key ? "page" : undefined}
                    >
                      <span className="sn-icon">{item.icon}</span>
                      <span className="sn-label">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {collapsed && flyout === entry.key && (
                <div className="sn-flyout" ref={flyoutRef}>
                  <div className="sn-flyout-title">{entry.label}</div>
                  {entry.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`sn-item sn-item--sub${active === item.key ? " sn-item--active" : ""}`}
                      onClick={() => {
                        onSelect(item.key);
                        setFlyout(null);
                      }}
                      aria-current={active === item.key ? "page" : undefined}
                    >
                      <span className="sn-icon">{item.icon}</span>
                      <span className="sn-label">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sn-foot">
        <button
          type="button"
          className="sn-collapse"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
        >
          <span className="sn-icon">{collapsed ? navIcons.panelOpen : navIcons.panelClose}</span>
          <span className="sn-label">Collapse</span>
        </button>
      </div>
    </aside>
  );
}