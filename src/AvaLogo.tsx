import ava from "../build/ava.svg";
export function AvaLogo({ size = 24 }: { size?: number }) {
  return (
    <img
      className="ava-logo"
      src={ava}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}
