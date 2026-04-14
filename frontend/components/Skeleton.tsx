"use client";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  circle?: boolean;
}

export default function Skeleton({ width, height, borderRadius, className = "", circle }: SkeletonProps) {
  const style: React.CSSProperties = {
    width: width || "100%",
    height: height || "1rem",
    borderRadius: circle ? "50%" : borderRadius || "8px",
  };

  return <div className={`skeleton ${className}`} style={style} />;
}
