"use client";
import styles from "./Background.module.css";

export default function Background() {
  return (
    <div className={styles.container}>
      <div className={styles.nebula} />
      <div className={styles.grain} />
      <div className={styles.stars} />
    </div>
  );
}
