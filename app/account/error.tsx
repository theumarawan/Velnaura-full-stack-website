"use client";
export default function AccountError({ reset }: { reset: () => void }) {
  return <main className="public-home"><h1>A small pause.</h1><p>We couldn&apos;t load your account. Please try again shortly.</p><button className="button" onClick={reset}>Try again</button></main>;
}

