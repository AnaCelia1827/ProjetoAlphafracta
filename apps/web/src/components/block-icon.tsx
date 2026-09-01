import { Icon } from "@iconify/react";
import boxMinimalisticBoldDuotone from "@iconify-icons/solar/box-minimalistic-bold-duotone";
import styles from "@/app/page.module.css";

export function BlockIcon({
  selected = false,
  size = "row",
}: {
  selected?: boolean;
  size?: "row" | "detail";
}) {
  return (
    <span
      className={`${styles.blockIcon} ${selected ? styles.blockIconSelected : ""} ${size === "detail" ? styles.blockIconDetail : ""}`}
      data-testid="block-icon"
      aria-hidden="true"
    >
      <Icon icon={boxMinimalisticBoldDuotone} />
    </span>
  );
}
