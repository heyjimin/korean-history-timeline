/** 로고 표시: 시간선 위의 세 점 (가운데가 지금 보고 있는 사건) */
export default function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg className="logo" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--logo-bg, #2f5aa0)" />
      <path d="M6 17h20" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
      <circle cx="8.5" cy="17" r="2.6" fill="#fff" fillOpacity="0.7" />
      <circle cx="16" cy="17" r="4" fill="#fff" />
      <circle cx="23.5" cy="17" r="2.6" fill="#fff" fillOpacity="0.7" />
      <path d="M16 8v4" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
