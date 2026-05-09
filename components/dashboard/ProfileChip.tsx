"use client";
import { useState } from "react";
import styles from "./ProfileChip.module.css";

interface ProfileChipProps {
  user: {
    id: string;
    name: string;
    photo: string | null;
  };
  onProfileClick: () => void;
  onLogout: () => void;
}

export default function ProfileChip({ user, onProfileClick, onLogout }: ProfileChipProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.container} onClick={() => setOpen(!open)}>
      <div className={styles.avatar}>
        {user.photo ? <img src={user.photo} alt="" /> : <span>{user.name?.[0] || "S"}</span>}
      </div>
      <div className={styles.info}>
        <div className={styles.name}>{user.id || "Student"}</div>
        <div className={styles.role}>Candidate</div>
      </div>
      <span className={styles.arrow}>{open ? "▴" : "▾"}</span>

      {open && (
        <div className={styles.dropdown} onClick={(e) => e.stopPropagation()}>
          <div className={styles.item} onClick={() => { onProfileClick(); setOpen(false); }}>
            <span className={styles.itemIcon}>👤</span> Profile
          </div>
          <div className={styles.item} onClick={onLogout}>
            <span className={styles.itemIcon}>🚪</span> Sign Out
          </div>
        </div>
      )}
    </div>
  );
}
