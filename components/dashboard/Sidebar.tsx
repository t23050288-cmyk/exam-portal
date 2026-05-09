"use client";
import styles from "./Sidebar.module.css";

interface NavItem {
  id: string;
  icon: string;
  label: string;
}

interface SidebarProps {
  items: NavItem[];
  activeItem: string;
  onItemClick: (id: string) => void;
  onLogout: () => void;
}

export default function Sidebar({ items, activeItem, onItemClick, onLogout }: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <div className={styles.logoIcon}>⚛</div>
        <div className={styles.logoText}>
          <span className={styles.brand}>NEXUS</span>
          <span className={styles.sub}>Candidate Portal</span>
        </div>
      </div>
      
      <nav className={styles.nav}>
        {items.map((item) => (
          <button
            key={item.id}
            className={`${styles.navBtn} ${activeItem === item.id ? styles.navBtnActive : ""}`}
            onClick={() => onItemClick(item.id)}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
            {activeItem === item.id && <span className={styles.navArrow}>›</span>}
          </button>
        ))}
      </nav>

      <div className={styles.footer}>
        <div className={styles.atomIcon}>⚛</div>
        <button className={styles.signOut} onClick={onLogout}>Sign Out</button>
      </div>
    </aside>
  );
}
