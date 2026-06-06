import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type LogoProps = {
  variant?: "full" | "icon";
  className?: string;
  href?: string;
};

export function Logo({
  variant = "full",
  className,
  href = "/",
}: LogoProps) {
  const src =
    variant === "icon" ? "/images/logo-icon.png" : "/images/lockup.png";

  const image = (
    <Image
      src={src}
      alt="PaidPR"
      width={variant === "icon" ? 120 : 180}
      height={variant === "icon" ? 82 : 47}
      className={cn(
        variant === "icon" ? "h-9 w-auto" : "h-8 w-auto",
        className,
      )}
      priority={variant === "full"}
    />
  );

  if (!href) {
    return image;
  }

  return (
    <Link href={href} className="inline-flex shrink-0 items-center">
      {image}
    </Link>
  );
}
