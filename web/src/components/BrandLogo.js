import Image from 'next/image';

export default function BrandLogo({ alt, width, height, className = '', priority = false }) {
  return (
    <Image
      src="/brand/logo-mark.png"
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={className}
    />
  );
}
