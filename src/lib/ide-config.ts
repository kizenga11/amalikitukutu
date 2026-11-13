// Feature switch for the C++ IDE "Run" button.
//
// Running code needs a self-hosted Judge0 instance (see docs/judge0-setup.md).
// Until one exists, the IDE stays write-only: students write C++ and submit it
// as their answer, exactly like a normal written question. Nothing else in the
// portal changes.
//
// To turn running on later:
//   1. Deploy Judge0 and set JUDGE0_URL + JUDGE0_KEY (server-side only).
//   2. Set NEXT_PUBLIC_IDE_RUN=on in .env.local / Vercel, then redeploy.
export const IDE_RUN_ENABLED = process.env.NEXT_PUBLIC_IDE_RUN === "on";
