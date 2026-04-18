import Link from 'next/link';
import Image from 'next/image';

interface Props {
  href: string;
  height?: number;
  width?: number;
  className?: string;
}

export default function HeaderLogo({ href, height = 32, width = 160, className }: Props) {
  return (
    <Link href={href} className={className}>
      <Image src="/logo.svg" alt="Fueling Sense" height={height} width={width} priority />
    </Link>
  );
}
